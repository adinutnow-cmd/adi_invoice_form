// ----------------- Supabase Config -----------------
const SUPABASE_URL = "https://ldtomlnitalgcubjfatc.supabase.co"; // نفس اللي عندك
const SUPABASE_KEY = "sb_publishable_rw-1_9n-zZxM3KCU9wxQAw_PoNLeTi9"; // المفتاح الـ anon/public

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// عشان نستخدمها بالأدمن (للداونلود)
let lastInvoicesData = [];

// ----------------- صفحة الفورم (الزبون) -----------------
const form = document.getElementById("invoiceForm");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submitBtn");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const full_name = document.getElementById("full_name").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const invoice_id = document.getElementById("invoice_id").value.trim();
    const imageFile = document.getElementById("image").files[0];

    if (!imageFile) {
      showStatus("Please upload an invoice image.", "error");
      return;
    }

    try {
      setSubmitting(true);
      showStatus("Uploading invoice, please wait…", "info");

      // ---------- 1) تأكد أن رقم الفاتورة غير مكرر ----------
      const { data: existing, error: existingError } = await supabaseClient
        .from("invoices")
        .select("id")
        .eq("invoice_id", invoice_id)
        .maybeSingle();

      if (existing) {
        // موجود قبل
        showStatus("⚠ رقم الفاتورة موجود مسبقاً. الرجاء التأكد من الرقم.", "error");
        setSubmitting(false);
        return;
      }

      // ---------- 2) Upload image to Supabase Storage ----------
      const fileName = `${Date.now()}_${imageFile.name}`;
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from("invoice-images")
        .upload(fileName, imageFile);

      if (uploadError) {
        console.error(uploadError);
        showStatus("Upload error: " + uploadError.message, "error");
        setSubmitting(false);
        return;
      }

      // Get public URL
      const { data: publicUrlData } = supabaseClient.storage
        .from("invoice-images")
        .getPublicUrl(fileName);

      const imageUrl = publicUrlData?.publicUrl;

      if (!imageUrl) {
        showStatus("Could not get image URL.", "error");
        setSubmitting(false);
        return;
      }

      // ---------- 3) Insert row into invoices ----------
      const createdAt = new Date().toISOString();

      const { error: insertError } = await supabaseClient
        .from("invoices")
        .insert({
          created_at: createdAt,
          full_name,
          phone,
          invoice_id,
          image_url: imageUrl,
          status: "pending",
        });

      if (insertError) {
        console.error(insertError);
        alert("Database error: " + insertError.message);
        showStatus("Database error: " + insertError.message, "error");
      } else {
        showStatus("Invoice submitted successfully ✅", "success");
        form.reset();
      }
    } catch (err) {
      console.error(err);
      alert("Unexpected error, please try again.");
      showStatus("Unexpected error, please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  });
}

function showStatus(msg, type) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.className = "status"; // reset
  if (type === "success") statusEl.classList.add("success");
  if (type === "error") statusEl.classList.add("error");
}

function setSubmitting(isSubmitting) {
  if (!submitBtn) return;
  submitBtn.disabled = isSubmitting;
}

// ----------------- صفحة الأدمن -----------------
const tableBody = document.getElementById("invoiceTableBody");
const downloadBtn = document.getElementById("downloadCsvBtn");
const deleteAllBtn = document.getElementById("deleteAllBtn");
const adminStatusEl = document.getElementById("adminStatus");

if (tableBody) {
  // لما تفتح صفحة الأدمن
  loadAdminTable();

  if (downloadBtn) {
    downloadBtn.addEventListener("click", handleDownloadCsv);
  }

  if (deleteAllBtn) {
    deleteAllBtn.addEventListener("click", handleDeleteAll);
  }
}

async function loadAdminTable() {
  setAdminStatus("Loading invoices…");

  const { data, error } = await supabaseClient
    .from("invoices")
    .select("*")
    .order("id", { ascending: false });

  if (error) {
    console.error(error);
    setAdminStatus("Error loading invoices: " + error.message, "error");
    return;
  }

  lastInvoicesData = data || [];

  // امسح الـ tbody
  tableBody.innerHTML = "";

  if (!data || data.length === 0) {
    setAdminStatus("No invoices found yet.");
    return;
  }

  setAdminStatus(`Loaded ${data.length} invoices.`);

  data.forEach((row) => {
    const tr = document.createElement("tr");

    const createdAt = row.created_at
      ? new Date(row.created_at).toLocaleString()
      : "";

    tr.innerHTML = `
      <td>${row.id ?? ""}</td>
      <td>${createdAt}</td>
      <td>${escapeHtml(row.full_name ?? "")}</td>
      <td>${escapeHtml(row.phone ?? "")}</td>
      <td>${escapeHtml(row.invoice_id ?? "")}</td>
      <td>${row.image_url ? `<a href="${row.image_url}" target="_blank"><img src="${row.image_url}" class="invoice-image" /></a>` : ""}</td>
      <td class="status-${row.status ?? "pending"}">${row.status ?? ""}</td>
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

// -------- Download as CSV (Excel) --------
function handleDownloadCsv() {
  if (!lastInvoicesData || lastInvoicesData.length === 0) {
    alert("No data to download.");
    return;
  }

  // headers
  const headers = ["id", "created_at", "full_name", "phone", "invoice_id", "image_url", "status"];

  const rows = lastInvoicesData.map((row) => {
    return [
      row.id,
      row.created_at,
      row.full_name,
      row.phone,
      row.invoice_id,
      row.image_url,
      row.status,
    ].map(csvEscape).join(",");
  });

  const csvContent = [headers.join(","), ...rows].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `invoices_export_${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// -------- Delete All Records --------
async function handleDeleteAll() {
  if (!confirm("Are you sure you want to delete ALL invoices? This cannot be undone.")) {
    return;
  }

  setAdminStatus("Deleting all invoices…");

  // انتبه: لازم يكون في RLS policy يسمح بالـ DELETE لكل المستخدمين
  const { error } = await supabaseClient
    .from("invoices")
    .delete()
    .gt("id", 0); // شرط بسيط يمسك كل السطور

  if (error) {
    console.error(error);
    setAdminStatus("Error deleting invoices: " + error.message, "error");
    alert("Delete error: " + error.message);
    return;
  }

  setAdminStatus("All invoices deleted.", "success");
  lastInvoicesData = [];
  tableBody.innerHTML = "";
}

// -------- Helpers --------
function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
