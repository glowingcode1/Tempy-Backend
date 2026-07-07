//to use this file, 
//first do
//1. export STRIPE_SECRET_KEY=sk_test_51QXn 
//2. run `node helperUtils/stripeTestPaymentMethodId.js` in terminal.
//  It will create a test payment method in your Stripe account and log the ID to the console. You can then use this ID for testing purposes in your application.


const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

(async () => {
  const pm = await stripe.paymentMethods.create({
    type: "card",
    card: {
      token: "tok_visa", // 🔥 use test token
    },
  });

})();