const client = window.supabaseClient || window.supabase.createClient(window.TALANTA_CONFIG.supabaseUrl, window.TALANTA_CONFIG.supabaseAnonKey);
const API = window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL ? window.APP_CONFIG.API_BASE_URL : "";

const params = new URLSearchParams(window.location.search);
const bookingId = params.get("booking");

const loading = document.getElementById("payment-loading");
const content = document.getElementById("payment-content");
const errorBox = document.getElementById("payment-error");
const successBox = document.getElementById("payment-success");
const form = document.getElementById("payment-reference-form");
const submitButton = document.getElementById("submit-payment");

let currentBooking = null;

function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
}

function formatMoney(amount) {
    return new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency: "KES"
    }).format(Number(amount || 0));
}

async function getSessionToken() {
    const { data, error } = await client.auth.getSession();

    if (error || !data.session) {
        const returnPath = `/payment.html?booking=${encodeURIComponent(bookingId || "")}`;
        window.location.href = `login.html?next=${encodeURIComponent(returnPath)}`;
        throw new Error("Please sign in to continue.");
    }

    return data.session.access_token;
}

function renderInstructions(method) {
    const config = window.PAYMENT_CONFIG;
    const container = document.getElementById("instruction-content");

    const mpesaConfigured = config?.mpesa?.enabled &&
        [config.mpesa.businessName, config.mpesa.paybill, config.mpesa.account]
            .every(value => typeof value === "string" &&
                value.trim() !== "" &&
                !value.trim().toUpperCase().startsWith("ENTER_"));
    const bankConfigured = config?.bank?.enabled &&
        [config.bank.bankName, config.bank.accountName,
            config.bank.accountNumber, config.bank.branch]
            .every(value => typeof value === "string" &&
                value.trim() !== "" &&
                !value.trim().toUpperCase().startsWith("ENTER_"));

    if (method === "mpesa" && mpesaConfigured) {
        container.innerHTML = `
      <div class="payment-instruction">
        <strong>M-Pesa Paybill</strong><br>
        Business: ${escapeHTML(config.mpesa.businessName)}<br>
        Paybill: ${escapeHTML(config.mpesa.paybill)}<br>
        Account: ${escapeHTML(config.mpesa.account)}
      </div>
      <p>Use your phone's M-Pesa menu to complete the payment.</p>
    `;
    } else if (method === "bank" && bankConfigured) {
        container.innerHTML = `
      <div class="payment-instruction">
        <strong>Bank transfer</strong><br>
        Bank: ${escapeHTML(config.bank.bankName)}<br>
        Account name: ${escapeHTML(config.bank.accountName)}<br>
        Account number: ${escapeHTML(config.bank.accountNumber)}<br>
        Branch: ${escapeHTML(config.bank.branch)}
      </div>
    `;
    } else if (method === "card") {
        container.textContent =
            config?.card?.message || "Card payment is not available yet.";
        form.hidden = true;
    } else {
        container.textContent =
            "Payment instructions are not configured for this method. Please contact the stadium before making a payment.";
        form.hidden = true;
    }

    return !form.hidden;
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

async function loadBooking() {
    if (!bookingId) {
        throw new Error("No booking reference was supplied.");
    }

    const token = await getSessionToken();

    const response = await fetch(
        `${API}/api/bookings/${encodeURIComponent(bookingId)}/payment`,
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.error || "Could not load your booking.");
    }

    currentBooking = result.booking;

    document.getElementById("event-title").textContent =
        currentBooking.event_title;

    document.getElementById("event-details").textContent =
        `${currentBooking.venue || "Venue to be confirmed"} · ${currentBooking.event_date ? new Date(currentBooking.event_date).toLocaleString() : "Date to be confirmed"}`;

    document.getElementById("booking-reference").textContent =
        currentBooking.id;

    document.getElementById("ticket-quantity").textContent =
        currentBooking.quantity;

    document.getElementById("booking-total").textContent =
        formatMoney(currentBooking.total_amount);

    document.getElementById("payment-method").textContent =
        currentBooking.payment_method;

    const canSubmitReference = renderInstructions(currentBooking.payment_method);

    if (currentBooking.payment_status === "pending_payment") {
        document.getElementById("payment-status").textContent =
            currentBooking.payment_reference
                ? "Your reference has been submitted. Awaiting verification."
                : "Payment has not yet been submitted.";
        document.getElementById("transaction-reference").value =
            currentBooking.payment_reference || "";
        if (!canSubmitReference) {
            document.getElementById("payment-status").textContent =
                "Payment instructions are not configured. Please contact the stadium.";
        }
    } else if (currentBooking.payment_status === "paid") {
        form.hidden = true;
        document.getElementById("payment-status").textContent =
            "Payment approved. Your digital ticket is available in your dashboard.";
    } else if (currentBooking.payment_status === "rejected") {
        form.hidden = true;
        document.getElementById("payment-status").textContent =
            `Payment reference rejected. ${currentBooking.payment_review_note || "Contact support before trying again."}`;
    } else {
        form.hidden = true;
        document.getElementById("payment-status").textContent =
            `Payment status: ${currentBooking.payment_status}`;
    }

    loading.hidden = true;
    content.hidden = false;
}

form.addEventListener("submit", async event => {
    event.preventDefault();

    const reference = document
        .getElementById("transaction-reference")
        .value.trim();

    if (!reference || reference.length < 4) {
        showError("Enter a valid payment transaction reference.");
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";

    try {
        const token = await getSessionToken();

        const response = await fetch(
            `${API}/api/bookings/${encodeURIComponent(bookingId)}/payment-reference`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
            },
                body: JSON.stringify({ reference })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Could not submit your reference.");
        }

        successBox.textContent =
            "Payment reference submitted successfully. Your payment is awaiting administrator verification.";

        successBox.hidden = false;
        document.getElementById("payment-status").textContent =
            "Awaiting payment verification.";

        document.getElementById("transaction-reference").disabled = true;
        submitButton.hidden = true;
    } catch (error) {
        showError(error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Submit payment reference";
    }
});

loadBooking().catch(error => {
    loading.hidden = true;
    showError(error.message);
});