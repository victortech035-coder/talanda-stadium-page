const express = require("express");
const router = express.Router();

const { supabaseAdmin } = require("../supabase");
const { requireAuth, requireAdmin } = require("../middleware/auth");

router.use(requireAuth, requireAdmin);

const allowedStatuses = [
    "upcoming",
    "completed",
    "cancelled"
];

function cleanText(value, max = 200) {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, max);
}

function validDate(value) {
    return typeof value === "string" &&
        !Number.isNaN(Date.parse(value));
}

function validImageUrl(value) {
    if (!value) return true;

    try {
        const url = new URL(value);
        return ["https:", "http:"].includes(url.protocol);
    } catch {
        return false;
    }
}

function validateEvent(body) {
    const title = cleanText(body.title, 150);
    const description = cleanText(body.description, 5000);
    const venue = cleanText(body.venue, 200);
    const event_date = body.event_date;
    const image_url = cleanText(body.image_url, 1000);
    const status = body.status || "upcoming";

    if (!title || !venue || !validDate(event_date)) {
        return {
            error: "Event title, venue and a valid event date are required."
        };
    }

    if (!allowedStatuses.includes(status)) {
        return { error: "Invalid event status." };
    }

    if (!validImageUrl(image_url)) {
        return { error: "The event image must use a valid HTTP or HTTPS URL." };
    }

    return {
        data: {
            title,
            description,
            venue,
            event_date: new Date(event_date).toISOString(),
            image_url: image_url || null,
            status
        }
    };
}

function validateTicketTypes(items) {
    if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
        return { error: "Add between 1 and 20 ticket categories." };
    }

    const names = new Set();
    const result = [];

    for (const item of items) {
        const name = cleanText(item.name, 60);
        const price = Number(item.price);
        const quantity = Number(item.quantity);

        if (!name || names.has(name.toLowerCase())) {
            return { error: "Ticket category names must be unique and non-empty." };
        }

        if (!Number.isFinite(price) || price < 0 || price > 10000000) {
            return { error: "Enter a valid ticket price." };
        }

        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000000) {
            return { error: "Ticket quantity must be a whole number greater than zero." };
        }

        names.add(name.toLowerCase());

        result.push({
            name,
            price,
            quantity,
            available: quantity
        });
    }

    return { data: result };
}

// GET /api/admin/events
router.get("/events", async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from("events")
            .select(`
        id,
        title,
        description,
        venue,
        event_date,
        image_url,
        status,
        ticket_types (
          id,
          name,
          price,
          quantity,
          available
        )
      `)
            .order("event_date", { ascending: false });

        if (error) throw error;

        res.json({ events: data || [] });
    } catch (error) {
        console.error("Admin events error:", error);
        res.status(500).json({ error: "Could not load events." });
    }
});

// POST /api/admin/events
router.post("/events", async (req, res) => {
    try {
        const validated = validateEvent(req.body);

        if (validated.error) {
            return res.status(400).json({ error: validated.error });
        }

        const tickets = validateTicketTypes(req.body.ticket_types);

        if (tickets.error) {
            return res.status(400).json({ error: tickets.error });
        }

        const { data: event, error: eventError } = await supabaseAdmin
            .from("events")
            .insert(validated.data)
            .select()
            .single();

        if (eventError) throw eventError;

        const ticketRows = tickets.data.map(ticket => ({
            ...ticket,
            event_id: event.id
        }));

        const { data: ticketTypes, error: ticketError } = await supabaseAdmin
            .from("ticket_types")
            .insert(ticketRows)
            .select();

        if (ticketError) {
            // Roll back the event if its ticket categories cannot be created.
            await supabaseAdmin
                .from("events")
                .delete()
                .eq("id", event.id);

            throw ticketError;
        }

        res.status(201).json({
            message: "Event created successfully.",
            event: {
                ...event,
                ticket_types: ticketTypes
            }
        });
    } catch (error) {
        console.error("Create event error:", error);
        res.status(500).json({ error: "Could not create event." });
    }
});

// PUT /api/admin/events/:id
router.put("/events/:id", async (req, res) => {
    try {
        const validated = validateEvent(req.body);

        if (validated.error) {
            return res.status(400).json({ error: validated.error });
        }

        const { data, error } = await supabaseAdmin
            .from("events")
            .update(validated.data)
            .eq("id", req.params.id)
            .select()
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({ error: "Event not found." });
        }

        res.json({
            message: "Event updated successfully.",
            event: data
        });
    } catch (error) {
        console.error("Update event error:", error);
        res.status(500).json({ error: "Could not update event." });
    }
});

// POST /api/admin/events/:id/ticket-types
router.post("/events/:id/ticket-types", async (req, res) => {
    try {
        const tickets = validateTicketTypes([req.body]);

        if (tickets.error) {
            return res.status(400).json({ error: tickets.error });
        }

        const { data: event, error: eventError } = await supabaseAdmin
            .from("events")
            .select("id")
            .eq("id", req.params.id)
            .maybeSingle();

        if (eventError) throw eventError;

        if (!event) {
            return res.status(404).json({ error: "Event not found." });
        }

        const { data, error } = await supabaseAdmin
            .from("ticket_types")
            .insert({
                ...tickets.data[0],
                event_id: event.id
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            message: "Ticket category created.",
            ticket_type: data
        });
    } catch (error) {
        console.error("Create ticket type error:", error);
        res.status(500).json({ error: "Could not create ticket category." });
    }
});

// PUT /api/admin/ticket-types/:id
router.put("/ticket-types/:id", async (req, res) => {
    try {
        const name = cleanText(req.body.name, 60);
        const price = Number(req.body.price);
        const newQuantity = Number(req.body.quantity);

        if (
            !name ||
            !Number.isFinite(price) ||
            price < 0 ||
            !Number.isInteger(newQuantity) ||
            newQuantity < 1
        ) {
            return res.status(400).json({
                error: "Enter a valid name, price and ticket quantity."
            });
        }

        const { data: existing, error: lookupError } = await supabaseAdmin
            .from("ticket_types")
            .select("id, quantity, available")
            .eq("id", req.params.id)
            .maybeSingle();

        if (lookupError) throw lookupError;

        if (!existing) {
            return res.status(404).json({
                error: "Ticket category not found."
            });
        }

        const sold = existing.quantity - existing.available;

        if (newQuantity < sold) {
            return res.status(409).json({
                error: `At least ${sold} tickets have already been sold. Quantity cannot be lower.`
            });
        }

        const { data, error } = await supabaseAdmin
            .from("ticket_types")
            .update({
                name,
                price,
                quantity: newQuantity,
                available: newQuantity - sold
            })
            .eq("id", req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            message: "Ticket category updated.",
            ticket_type: data
        });
    } catch (error) {
        console.error("Update ticket type error:", error);
        res.status(500).json({
            error: "Could not update ticket category."
        });
    }
});

// DELETE /api/admin/ticket-types/:id
router.delete("/ticket-types/:id", async (req, res) => {
    try {
        const { data: ticket, error: lookupError } = await supabaseAdmin
            .from("ticket_types")
            .select("id, quantity, available")
            .eq("id", req.params.id)
            .maybeSingle();

        if (lookupError) throw lookupError;

        if (!ticket) {
            return res.status(404).json({
                error: "Ticket category not found."
            });
        }

        if (ticket.quantity !== ticket.available) {
            return res.status(409).json({
                error: "This category has booking activity and cannot be deleted. Set its availability to zero through an inventory-management update instead."
            });
        }

        const { error } = await supabaseAdmin
            .from("ticket_types")
            .delete()
            .eq("id", req.params.id);

        if (error) throw error;

        res.json({ message: "Ticket category deleted." });
    } catch (error) {
        console.error("Delete ticket type error:", error);
        res.status(500).json({
            error: "Could not delete ticket category."
        });
    }
});

// POST /api/admin/events/:id/archive
// Archive by cancelling rather than deleting historical event records.
router.post("/events/:id/archive", async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from("events")
            .update({ status: "cancelled" })
            .eq("id", req.params.id)
            .select("id, title, status")
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({ error: "Event not found." });
        }

        res.json({
            message: "Event archived.",
            event: data
        });
    } catch (error) {
        console.error("Archive event error:", error);
        res.status(500).json({ error: "Could not archive event." });
    }
});

module.exports = router;