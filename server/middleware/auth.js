const { supabaseAdmin } = require("../supabase");

async function authenticate(req, res, next) {
    try {
        const header = req.headers.authorization || "";
        const token = header.startsWith("Bearer ")
            ? header.slice(7)
            : null;

        if (!token) {
            return res.status(401).json({
                error: "Please log in first."
            });
        }

        const { data, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !data.user) {
            return res.status(401).json({
                error: "Invalid or expired session."
            });
        }

        req.user = data.user;
        req.accessToken = token;
        next();
    } catch (error) {
        res.status(500).json({ error: "Authentication failed." });
    }
}

async function requireAdmin(req, res, next) {
    try {
        const { data, error } = await supabaseAdmin
            .from("profiles")
            .select("role")
            .eq("id", req.user.id)
            .single();

        if (error || data?.role !== "admin") {
            return res.status(403).json({
                error: "Administrator access required."
            });
        }

        next();
    } catch (error) {
        res.status(500).json({ error: "Authorization check failed." });
    }
}

const requireAuth = authenticate;

module.exports = { authenticate, requireAuth, requireAdmin };
