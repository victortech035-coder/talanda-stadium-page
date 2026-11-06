require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const QRCode = require("qrcode");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const { supabaseAdmin } = require("./server/supabase");
const { authenticate, requireAdmin } = require("./server/middleware/auth");
const eventRoutes = require("./server/routes/events");
const bookingRoutes = require("./server/routes/bookings");
const paymentRoutes = require("./server/routes/payments");
const ticketRoutes = require("./server/routes/tickets");
const adminEventRoutes = require("./server/routes/admin-events");
const adminBookingRoutes = require("./server/routes/admin-bookings");

const app = express();

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "https://cdn.jsdelivr.net",
                "https://unpkg.com"
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com"
            ],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: [
                "'self'",
                "https://*.supabase.co",
                "wss://*.supabase.co"
            ],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'self'"]
        }
    }
}));
app.use(cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5000"
}));
app.use(express.json({ limit: "20kb" }));

app.use("/api", rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 150
}));

app.use(express.static(path.join(__dirname, "public")));
app.use("/api", eventRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/bookings", paymentRoutes);
app.use("/api", ticketRoutes);
app.use("/api/admin", adminEventRoutes);
app.use("/api/admin", adminBookingRoutes);

app.get("/api/health", (req, res) => {
    res.json({ status: "online", platform: "TALANTA STADIUM" });
});

app.post("/api/bookings", authenticate, async (req, res) => {
    try {
        const {
            eventId,
            ticketTypeId,
            quantity,
            paymentMethod,
            paymentReference
        } = req.body;

        const allowedMethods = ["mpesa", "bank", "card"];

        if (
            !eventId ||
            !ticketTypeId ||
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > 10 ||
            !allowedMethods.includes(paymentMethod)
        ) {
            return res.status(400).json({ error: "Invalid booking details." });
        }

        const userClient = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${req.accessToken}`
                    }
                },
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        const { data, error } = await userClient.rpc("create_booking", {
            p_event_id: eventId,
            p_ticket_type_id: ticketTypeId,
            p_quantity: quantity,
            p_payment_method: paymentMethod,
            p_payment_reference: paymentReference || null
        });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        res.status(201).json({
            message: "Booking created. Awaiting payment confirmation.",
            booking: {
                id: data,
                payment_status: "pending_payment"
            },
            bookingId: data,
            paymentStatus: "pending_payment"
        });
    } catch (error) {
        res.status(500).json({ error: "Booking could not be created." });
    }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`TALANTA STADIUM running on port ${PORT}`);
});
