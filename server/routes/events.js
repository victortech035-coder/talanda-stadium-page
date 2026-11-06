const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("./supabase");

router.get("/events", async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from("events")
            .select("*, ticket_types(*)")
            .eq("status", "upcoming")
            .order("event_date", { ascending: true });

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: "Could not load events." });
    }
});

router.get("/events/:id", async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from("events")
            .select("*")
            .eq("id", req.params.id)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: "Event not found." });
        }

        res.json({ event: data });
    } catch (error) {
        res.status(500).json({ error: "Could not load event." });
    }
});

router.get("/events/:id/ticket-types", async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from("ticket_types")
            .select("id, event_id, name, price, quantity, available")
            .eq("event_id", req.params.id)
            .gt("available", 0)
            .order("price", { ascending: true });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        res.json({ ticket_types: data || [] });
    } catch (error) {
        res.status(500).json({ error: "Could not load ticket categories." });
    }
});

module.exports = router;
