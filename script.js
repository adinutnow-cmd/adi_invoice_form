// ----------------- Supabase Config -----------------
const SUPABASE_URL = "https://ldtomlnitalgcubjfatc.supabase.co";
const SUPABASE_KEY = "sb_publishable_rw-1_9n-zZxM3KCU9wxQAw_PoNLeTi9";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ----------------- GLOBALS -----------------
let lastInvoicesData = []; // For CSV download
const form = document.getElementById("invoiceForm");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submitBtn");

// ----------------- FORM PAGE (CUSTOMER) -----------------
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const full_name = document.getElementById("full_name").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const invoice_id = document.getElementById("invoice_id").value.trim();
    const imageFile = document.getElementById("image").files[0];

    if (!imageFile) {
      return showStatus("⚠ الرجاء رفع صورة الفاتورة", "error");
    }

    try {
      setSubmitting(true);
      showStatus("جاري التحقق من رقم الفاتورة…", "info");

      // -------- CHECK IF invoice_id already exists --------
      const { data: exists, error: checkErr } = await supabaseClient
        .from("invoices")
        .select("id")
        .eq("invoice_id", invoice_id);

      if (checkErr) {
        console.error(checkErr);
        showStatus("حدث خطأ غير متوقع، حاول مجددًا.", "error");
        return setSubmitting(false);
      }

      if (exists && exists.length > 0) {
        showStatus("⚠ رقم الفاتورة مستخدم سابقاً! الرجاء التأكد.", "error");
        return setSubmitting(false);
      }

      // -------- UPLOAD IMAGE --------
      showStatus("جاري رفع الصورة…", "info");

      const fileName = `${Date.now()}_${imageFile.name}`;
      const { error: uploadError } = await supabaseClient.storage
        .from("invoice-images")
        .upload(fileName, imageFile);

      if (uploadError) {
        console.error(uploadError);
        showStatus("خطأ في رفع الصورة: " + uploadError.message, "error");
        return setSubmitting(false);
      }

      const { data: urlData } = supabaseClient.storage
        .from("invoice-images")
        .getPublicUrl(fileName);

      const imageUrl = urlData.publicUrl;

      // -------- INSERT INTO invoices --------
      const createdAt = new Date().toISOString();

      const { error: insertErr } = await supabaseClient.from("invoices").insert({
        created_at: createdAt,
        full_name,
        phone,
        invoice_id,
        image_url: imageUrl,
        status: "pending",
      });

      if (insertErr) {
        console.error(insertErr);
        showStatus("Database error: " + insertErr.message, "error");
      } else {
        showStatus("✅ تم رفع الفاتورة بنجاح!", "success");
        form.reset();
      }

    } catch (err) {
      console.error(err);
      showStatus("خطأ غير متوقع، حاول لاحقاً.", "error");

    } finally {
      setSubmitting(false);
    }
  });
}

function showStatus(msg, type) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.className = "status";
  if (type === "success") statusEl.classList.add("success");
  if (type === "error") statusEl.classList.add("error");
  if (type === "info") statusEl.classList.add("info");
}

function setSubmitting(state) {
  if (submitBtn) submitBtn.disabled = state;
}

// ----------------- ADMIN PAGE -----------------
const tableBody = document.getElementById("invoiceTableBody");
const downloadBtn = document.getElementById("downloadCsvBtn");
const deleteAllBtn = document.getElementById("deleteAllBtn");
const adminStatusEl = document.getElementById("adminStatus");

if (tableBody) {
  loadAdminTable();

  if (downloadBtn) downloadBtn.addEventListener("click", handleDownloadCsv);
  if (deleteAllBtn) deleteAllBtn.addEventListener("click", handleDeleteAll);
}

async function loadAdminTable() {
  setAdminStatus("Loading invoices…");

  const { data, error } = await supabaseClient
    .from("invoices")
    .select("*")
    .order("id", { ascending: false });

  if (error) {
    console.error(error);
    return setAdminStatus("Error: " + error.message, "error");
  }

  lastInvoicesData = data;
  tableBody.innerHTML = "";

  if (!data || data.length === 0) {
    return setAdminStatus("No invoices yet.");
  }

  setAdminStatus(`Loaded ${data.length} invoices.`);

  data.forEach((row) => {
    const tr = document.createElement("tr");
    const createdAt = row.created_at
      ? new Date(row.created_at).toLocaleString()
      : "";

    tr.innerHTML = `
      <td>${row.id}</td>
      <td>${createdAt}</td>
      <td>${escapeHtml(row.full_name)}</td>
      <td>${escapeHtml(row.phone)}</td>
      <td>${escapeHtml(row.invoice_id)}</td>
      <td><a href="${row.image_url}" target="_blank">
        <img src="${row.image_url}" class="invoice-image" />
      </a></td>
      <td class="status-${row.status}">${row.status}</td>
    `;
    tableBody.appendChild(tr);
  });
}

function setAdminStatus(msg, type) {
  if (!adminStatusEl) return;
  adminStatusEl.textContent = msg;
  adminStatusEl.className = "status";
  if (type === "error") adminStatusEl.classList.add("error");
  if (type === "success") adminStatusEl.classList.add("success");
}

function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ----------------- CSV DOWNLOAD -----------------
function handleDownloadCsv() {
  if (!lastInvoicesData.length) return alert("لا يوجد بيانات للتنزيل.");

  const headers = ["id", "created_at", "full_name", "phone", "invoice_id", "image_url", "status"];
  const rows = lastInvoicesData.map((r) =>
    headers.map((h) => csvEscape(r[h])).join(",")
  );

  const file = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([file], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `invoices_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(val) {
  if (val == null) return "";
  val = String(val);
  if (/[",\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
  return val;
}

// ----------------- DELETE ALL -----------------
async function handleDeleteAll() {
  if (!confirm("هل أنت متأكد من حذف جميع الفواتير؟")) return;

  const { error } = await supabaseClient.from("invoices").delete().gt("id", 0);

  if (error) {
    console.error(error);
    alert("Delete error: " + error.message);
    return;
  }

  tableBody.innerHTML = "";
  lastInvoicesData = [];
  setAdminStatus("All invoices deleted.", "success");
}
