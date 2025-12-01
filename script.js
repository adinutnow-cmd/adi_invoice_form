// ------------------ SUPABASE CONFIG ------------------
const SUPABASE_URL = "https://ldtomlnitalgcubjfatc.supabase.co";
const SUPABASE_KEY = "sb_publishable_rw-1_9n-zZxM3KCU9wxQAw_PoNLeTi9";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ------------------ SUBMIT INVOICE ------------------
const form = document.getElementById("invoiceForm");

if (form) {
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        let full_name = document.getElementById("full_name").value;
        let phone = document.getElementById("phone").value;
        let invoice_id = document.getElementById("invoice_id").value;
        let imageFile = document.getElementById("image").files[0];

        if (!imageFile) return alert("Please upload an image!");

        // Upload image → Supabase Bucket
        let fileName = `${Date.now()}_${imageFile.name}`;

        let { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from("invoice-images")
            .upload(fileName, imageFile);

        if (uploadError) {
            console.error(uploadError);
            return alert("Upload error: " + uploadError.message);
        }

        // Public URL
        let { data: urlData } = supabaseClient.storage
            .from("invoice-images")
            .getPublicUrl(fileName);

        // Insert record in DB
        let { data, error } = await supabaseClient
            .from("invoices")
            .insert({
                full_name,
                phone,
                invoice_id,
                image_url: urlData.publicUrl,
                status: "pending"
            });

        if (error) {
            console.error(error);
            return alert("Database error: " + error.message);
        }

        document.getElementById("result").innerText =  
            "Invoice Submitted Successfully!";
        form.reset();
    });
}

// ------------------ ADMIN TABLE LOAD ------------------
async function loadAdminTable() {
    const table = document.getElementById("invoiceTable");
    if (!table) return;

    let { data, error } = await supabaseClient
        .from("invoices")
        .select("*")
        .order("id", { ascending: false });

    if (error) {
        console.error(error);
        table.innerHTML = "<tr><td colspan='7'>Error loading invoices</td></tr>";
        return;
    }

    table.innerHTML = "";
    data.forEach(row => {
        let tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${row.id}</td>
            <td>${row.created_at}</td>
            <td>${row.full_name}</td>
            <td>${row.phone}</td>
            <td>${row.invoice_id}</td>
            <td><img src="${row.image_url}" class="invoice-image"></td>
            <td class="status-${row.status}">${row.status}</td>
        `;

        table.appendChild(tr);
    });
}

loadAdminTable();
