module.exports = {
    mode: "manual",

    methods: {
        mpesa: {
            enabled: true,
            name: "M-Pesa",
            instructions:
                "Pay using the organiser's approved M-Pesa details. Enter your transaction reference."
        },

        bank: {
            enabled: true,
            name: "Bank Transfer",
            instructions:
                "Transfer to the organiser's approved bank account and submit your payment reference."
        },

        card: {
            enabled: false,
            name: "Card Payment",
            instructions:
                "Card payment integration will be configured later."
        }
    }

};