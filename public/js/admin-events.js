(() => {
    const client = window.supabaseClient || window.supabase.createClient(window.TALANTA_CONFIG.supabaseUrl, window.TALANTA_CONFIG.supabaseAnonKey);
    const API = window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL ? window.APP_CONFIG.API_BASE_URL : "";

    const list = document.getElementById("admin-events-list");
    const form = document.getElementById("admin-event-form");
    const ticketFields = document.getElementById("ticket-category-fields");
    const message = document.getElementById("event-message");

    if (!client || !form || !list || !ticketFields) {
        console.error("Admin event management elements are missing.");
        return;
    }

    let events = [];
    let editing = false;

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);
    }

    function notify(text, isError = false) {
        message.textContent = text;
        message.className = isError ? "error" : "";
    }

    async function apiRequest(path, options = {}) {
        const { data, error } = await client.auth.getSession();

        if (error || !data.session) {
            window.location.href = "login.html";
            throw new Error("Please log in as an administrator.");
        }

        const response = await fetch(`${API}${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${data.session.access_token}`,
                ...(options.headers || {})
            }
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Request failed.");
        }

        return result;
    }

    function addTicketCategory(ticket = {}) {
        const row = document.createElement("div");
        row.className = "ticket-category-row";

        row.innerHTML = `
      <label>Category name</label>
      <input class="ticket-name" maxlength="60"
             value="${escapeHTML(ticket.name || "")}"
             placeholder="VIP / Regular / VVIP" required>

      <label>Price (KES)</label>
      <input class="ticket-price" type="number" min="0"
             step="0.01" value="${ticket.price ?? ""}" required>

      <label>Total ticket quantity</label>
      <input class="ticket-quantity" type="number" min="1"
             step="1" value="${ticket.quantity ?? ""}" required>

      <button type="button" class="remove-ticket">
        Remove category
      </button>
    `;

        row.querySelector(".remove-ticket").addEventListener("click", () => {
            row.remove();
        });

        ticketFields.appendChild(row);
    }

    function collectTicketCategories() {
        return [...ticketFields.querySelectorAll(".ticket-category-row")]
            .map(row => ({
                name: row.querySelector(".ticket-name").value.trim(),
                price: Number(row.querySelector(".ticket-price").value),
                quantity: Number(row.querySelector(".ticket-quantity").value)
            }));
    }

    function resetForm() {
        form.reset();
        document.getElementById("event-id").value = "";
        document.getElementById("event-form-heading").textContent =
            "Create New Event";
        document.getElementById("save-event-button").textContent =
            "Save Event";
        document.getElementById("cancel-edit-button").hidden = true;

        ticketFields.replaceChildren();
        addTicketCategory();

        editing = false;
    }

    function renderEvents() {
        if (!events.length) {
            list.textContent = "No events have been created yet.";
            return;
        }

        list.replaceChildren();

        events.forEach(event => {
            const card = document.createElement("article");
            card.className = "event-admin-card";

            const title = document.createElement("h4");
            title.textContent = event.title;

            const venue = document.createElement("p");
            venue.textContent = event.venue;

            const date = document.createElement("p");
            date.textContent = new Date(event.event_date).toLocaleString();

            const status = document.createElement("span");
            status.className = "event-status";
            status.textContent = event.status;

            const tickets = document.createElement("p");
            const categories = event.ticket_types || [];

            tickets.textContent = categories.map(ticket =>
                `${ticket.name}: ${ticket.available}/${ticket.quantity} available`
            ).join(" · ") || "No ticket categories";

            const actions = document.createElement("div");
            actions.className = "event-admin-actions";

            const edit = document.createElement("button");
            edit.type = "button";
            edit.textContent = "Edit event";
            edit.addEventListener("click", () => editEvent(event.id));

            const archive = document.createElement("button");
            archive.type = "button";
            archive.textContent = "Archive";
            archive.disabled = event.status === "cancelled";
            archive.addEventListener("click", () => archiveEvent(event.id));

            const addTicket = document.createElement("button");
            addTicket.type = "button";
            addTicket.textContent = "Add ticket category";
            addTicket.addEventListener("click", () => addCategory(event.id));

            actions.append(edit, addTicket, archive);
            card.append(title, venue, date, status, tickets, actions);
            list.appendChild(card);
        });
    }

    async function loadEvents() {
        try {
            const result = await apiRequest("/api/admin/events");
            events = result.events || [];
            renderEvents();
        } catch (error) {
            notify(error.message, true);
            list.textContent = "Unable to load events.";
        }
    }

    function editEvent(id) {
        const event = events.find(item => item.id === id);
        if (!event) return;

        editing = true;

        document.getElementById("event-id").value = event.id;
        document.getElementById("event-title-input").value = event.title;
        document.getElementById("event-description-input").value =
            event.description || "";
        document.getElementById("event-venue-input").value = event.venue;

        const date = new Date(event.event_date);
        const localDate = new Date(
            date.getTime() - date.getTimezoneOffset() * 60000
        ).toISOString().slice(0, 16);

        document.getElementById("event-date-input").value = localDate;
        document.getElementById("event-image-input").value =
            event.image_url || "";
        document.getElementById("event-status-input").value = event.status;

        ticketFields.replaceChildren();

        (event.ticket_types || []).forEach(ticket => {
            const row = document.createElement("div");
            row.className = "ticket-category-row";

            row.innerHTML = `
        <strong>${escapeHTML(ticket.name)}</strong>
        <p>Price: KSh ${Number(ticket.price).toLocaleString()}</p>
        <p>Remaining: ${ticket.available} / ${ticket.quantity}</p>
        <p class="form-note">
          Existing ticket categories are managed separately.
          Use "Add ticket category" to create another category.
        </p>
      `;

            ticketFields.appendChild(row);
        });

        document.getElementById("event-form-heading").textContent =
            "Edit Event Details";
        document.getElementById("save-event-button").textContent =
            "Update Event";
        document.getElementById("cancel-edit-button").hidden = false;

        document.getElementById("event-form-heading")
            .scrollIntoView({ behavior: "smooth" });
    }

    async function addCategory(eventId) {
        const name = prompt("Enter ticket category name:");
        if (!name) return;

        const priceInput = prompt("Enter ticket price in KSh:");
        if (priceInput === null) return;

        const quantityInput = prompt("Enter ticket quantity:");
        if (quantityInput === null) return;

        try {
            await apiRequest(
                `/api/admin/events/${encodeURIComponent(eventId)}/ticket-types`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        name,
                        price: Number(priceInput),
                        quantity: Number(quantityInput)
                    })
                }
            );

            notify("Ticket category added successfully.");
            await loadEvents();
        } catch (error) {
            notify(error.message, true);
        }
    }

    async function archiveEvent(id) {
        if (!confirm("Archive this event? It will be marked as cancelled.")) {
            return;
        }

        try {
            await apiRequest(
                `/api/admin/events/${encodeURIComponent(id)}/archive`,
                { method: "POST", body: JSON.stringify({}) }
            );

            notify("Event archived.");
            await loadEvents();
        } catch (error) {
            notify(error.message, true);
        }
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const id = document.getElementById("event-id").value;

        const payload = {
            title: document.getElementById("event-title-input").value.trim(),
            description: document.getElementById("event-description-input").value,
            venue: document.getElementById("event-venue-input").value.trim(),
            event_date: new Date(
                document.getElementById("event-date-input").value
            ).toISOString(),
            image_url: document.getElementById("event-image-input").value.trim(),
            status: document.getElementById("event-status-input").value
        };

        const button = document.getElementById("save-event-button");
        button.disabled = true;
        button.textContent = "Saving...";

        try {
            if (editing) {
                await apiRequest(
                    `/api/admin/events/${encodeURIComponent(id)}`,
                    {
                        method: "PUT",
                        body: JSON.stringify(payload)
                    }
                );

                notify("Event details updated successfully.");
            } else {
                payload.ticket_types = collectTicketCategories();

                await apiRequest("/api/admin/events", {
                    method: "POST",
                    body: JSON.stringify(payload)
                });

                notify("New event created successfully.");
            }

            resetForm();
            await loadEvents();
        } catch (error) {
            notify(error.message, true);
        } finally {
            button.disabled = false;
            button.textContent = editing ? "Update Event" : "Save Event";
        }
    });

    document.getElementById("new-event-button")
        .addEventListener("click", resetForm);

    document.getElementById("add-ticket-category")
        .addEventListener("click", () => {
            if (editing) {
                notify(
                    "Save your event details first. Add new categories using the event list.",
                    true
                );
                return;
            }

            addTicketCategory();
        });

    document.getElementById("cancel-edit-button")
        .addEventListener("click", resetForm);

    resetForm();
    loadEvents();
})();