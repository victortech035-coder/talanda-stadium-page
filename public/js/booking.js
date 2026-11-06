(() => {
    const API = window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL ? window.APP_CONFIG.API_BASE_URL : "";
    const client = window.supabaseClient || window.supabase.createClient(window.TALANTA_CONFIG.supabaseUrl, window.TALANTA_CONFIG.supabaseAnonKey);

    const modal = document.getElementById("bookingModal");
    const form = document.getElementById("bookingForm");
    const ticketType = document.getElementById("ticketType");
    const quantityInput = document.getElementById("ticketQuantity");
    const paymentMethod = document.getElementById("paymentMethod");
    const message = document.getElementById("bookingMessage");
    const submitButton = document.getElementById("submitBooking");
    const paymentOptions = [...paymentMethod.options].filter(option => option.value);

    if (!modal || !form) return;

    let selectedEventId = null;
    let selectedPrice = 0;
    let availableQuantity = 10;

    const money = amount =>
        `KES ${Number(amount || 0).toLocaleString("en-KE")}`;

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    async function getSession() {
        const { data, error } = await client.auth.getSession();

        if (error) throw error;
        return data.session;
    }

    async function request(path, options = {}) {
        const response = await fetch(`${API}${path}`, options);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || "Something went wrong.");
        }

        return data;
    }

    function showModal() {
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
    }

    function closeModal() {
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
    }

    function updateTotal() {
        const quantity = Math.max(
            1,
            Math.min(availableQuantity, Number(quantityInput.value) || 1)
        );

        quantityInput.value = quantity;

        document.getElementById("unitPrice").textContent = money(selectedPrice);
        document.getElementById("totalPrice").textContent =
            money(selectedPrice * quantity);
    }

    function paymentMethodIsConfigured(method) {
        const config = window.PAYMENT_CONFIG?.[method];
        if (!config?.enabled) return false;

        const fields = method === "mpesa"
            ? [config.businessName, config.paybill, config.account]
            : method === "bank"
                ? [config.bankName, config.accountName, config.accountNumber, config.branch]
                : [];

        return fields.length > 0 && fields.every(value =>
            typeof value === "string" &&
            value.trim() !== "" &&
            !value.trim().toUpperCase().startsWith("ENTER_")
        );
    }

    function configurePaymentOptions() {
        let available = 0;

        paymentOptions.forEach(option => {
            const configured = paymentMethodIsConfigured(option.value);
            option.disabled = !configured;
            option.textContent = option.dataset.label ||
                option.textContent.replace(/ — unavailable$/, "");
            option.dataset.label = option.textContent;

            if (!configured && !option.textContent.endsWith(" — unavailable")) {
                option.textContent += " — unavailable";
            }

            if (configured) available++;
        });

        if (available === 0) {
            message.textContent =
                "Online payment methods are not configured yet. Please contact the stadium before booking.";
            submitButton.disabled = true;
        }

        return available > 0;
    }

    async function openBooking(eventId) {
        selectedEventId = eventId;
        selectedPrice = 0;
        availableQuantity = 10;

        form.hidden = false;
        document.getElementById("bookingSuccess").hidden = true;
        message.textContent = "";
        submitButton.disabled = false;
        submitButton.textContent = "Continue with booking";
        const hasPaymentMethod = configurePaymentOptions();

        ticketType.innerHTML = '<option value="">Loading ticket categories...</option>';
        document.getElementById("bookingEventName").textContent = "Loading event...";
        quantityInput.value = 1;

        showModal();

        try {
            const eventData = await request(
                `/api/events/${encodeURIComponent(eventId)}`
            );

            const event = eventData.event || eventData;

            document.getElementById("bookingEventName").textContent =
                event.title || "Selected event";

            const typeData = await request(
                `/api/events/${encodeURIComponent(eventId)}/ticket-types`
            );

            const types = Array.isArray(typeData)
                ? typeData
                : typeData.ticket_types || [];

            const availableTypes = types.filter(type =>
                type.available !== false &&
                Number(type.quantity) > 0
            );

            if (!availableTypes.length) {
                ticketType.innerHTML = '<option value="">No tickets available</option>';
                message.textContent = "There are currently no available tickets.";
                submitButton.disabled = true;
                return;
            }

            ticketType.innerHTML =
                '<option value="">Choose a ticket category</option>' +
                availableTypes.map(type => `
          <option
            value="${escapeHTML(type.id)}"
            data-price="${Number(type.price)}"
            data-quantity="${Number(type.quantity)}">
            ${escapeHTML(type.name)} — ${money(type.price)}
            (${Number(type.quantity)} available)
          </option>
        `).join("");

            submitButton.disabled = !hasPaymentMethod;
            updateTotal();

        } catch (error) {
            ticketType.innerHTML = '<option value="">Unable to load tickets</option>';
            message.textContent = error.message;
            submitButton.disabled = true;
        }
    }

    ticketType.addEventListener("change", () => {
        const option = ticketType.selectedOptions[0];

        selectedPrice = Number(option?.dataset.price || 0);
        availableQuantity = Math.min(
            10,
            Number(option?.dataset.quantity || 10)
        );

        quantityInput.max = availableQuantity;
        quantityInput.value = 1;
        updateTotal();
    });

    paymentMethod.addEventListener("change", () => {
        submitButton.disabled = !paymentMethodIsConfigured(paymentMethod.value);
    });

    document.getElementById("increaseQuantity").addEventListener("click", () => {
        quantityInput.value = Math.min(
            availableQuantity,
            Number(quantityInput.value || 1) + 1
        );
        updateTotal();
    });

    document.getElementById("decreaseQuantity").addEventListener("click", () => {
        quantityInput.value = Math.max(
            1,
            Number(quantityInput.value || 1) - 1
        );
        updateTotal();
    });

    quantityInput.addEventListener("input", updateTotal);

    document.getElementById("closeBooking").addEventListener(
        "click", closeModal
    );

    document.getElementById("finishBooking").addEventListener(
        "click", closeModal
    );

    modal.addEventListener("click", event => {
        if (event.target === modal) closeModal();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && modal.classList.contains("open")) {
            closeModal();
        }
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        message.textContent = "";

        try {
            const session = await getSession();

            if (!session) {
                const returnPath = "/#events";
                window.location.href =
                    `login.html?next=${encodeURIComponent(returnPath)}`;
                return;
            }

            const selectedType = ticketType.value;
            const quantity = Number(quantityInput.value);
            const method = paymentMethod.value;

            if (!selectedEventId || !selectedType || !method) {
                throw new Error("Please select a ticket category and payment method.");
            }

            if (
                !Number.isInteger(quantity) ||
                quantity < 1 ||
                quantity > 10 ||
                quantity > availableQuantity
            ) {
                throw new Error("Please select a valid ticket quantity.");
            }

            submitButton.disabled = true;
            submitButton.textContent = "Submitting booking...";

            const result = await request("/api/bookings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    eventId: selectedEventId,
                    ticketTypeId: selectedType,
                    quantity,
                    paymentMethod: method
                })
            });

            const booking = result.booking || result;
            const reference = booking.id || booking.bookingId || booking.booking_id;

            if (!reference) {
                throw new Error("Booking response did not contain a reference.");
            }

            form.hidden = true;
            document.getElementById("bookingSuccess").hidden = false;
            document.getElementById("bookingReference").textContent = reference;
            document.getElementById("bookingSuccessMessage").textContent =
                "Your booking is pending payment. Follow the payment instructions " +
                "provided by TALANTA STADIUM. Your ticket will be issued after " +
                "the administrator verifies payment.";

            window.location.href = `payment.html?booking=${encodeURIComponent(reference)}`;

        } catch (error) {
            message.textContent = error.message;
            submitButton.disabled = false;
            submitButton.textContent = "Continue with booking";
        }
    });

    // Used by the event cards in app.js.
    window.openBooking = openBooking;
})();