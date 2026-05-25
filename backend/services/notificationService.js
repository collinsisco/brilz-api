const nodemailer = require('nodemailer');
const supabase   = require('../config/supabase');
const { formatKES } = require('../utils/formatters');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT)||587,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const sendEmail = async ({ to, subject, html }) => {
  if (!process.env.SMTP_USER) return;
  try {
    await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, html });
  } catch (e) { console.error('Email error:', e.message); }
};

const sendSMS = async ({ phone, message }) => {
  if (!process.env.AT_API_KEY) return;
  try {
    const AfricasTalking = require('africastalking');
    const at = AfricasTalking({ apiKey: process.env.AT_API_KEY, username: process.env.AT_USERNAME });
    await at.SMS.send({ to: [phone], message, from: process.env.AT_SENDER_ID });
  } catch (e) { console.error('SMS error:', e.message); }
};

const createDBNotification = async ({ userId, type, title, body, icon, actionUrl, metadata }) => {
  if (!userId) return;
  await supabase.from('notifications').insert({
    user_id: userId, type, title, body, icon: icon||'🔔',
    action_url: actionUrl, metadata,
  });
};

const sendPaymentConfirmation = async ({ user, order, mpesaRef }) => {
  const amount = formatKES(order.total_amount);
  const ref    = mpesaRef || order.id.slice(0,8).toUpperCase();

  // DB notification
  await createDBNotification({
    userId: user.id, type: 'payment', title: 'Payment Confirmed ✅',
    icon: '💚',
    body: `Your payment of ${amount} for order #${ref} was received.`,
    actionUrl: '/orders.html',
    metadata: { order_id: order.id, amount: order.total_amount, ref },
  });

  // Email
  if (user.email) {
    await sendEmail({
      to: user.email,
      subject: `✅ Order Confirmed — ${amount} received | Brilz`,
      html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        <h2 style="color:#00A550">Payment Confirmed!</h2>
        <p>Hi ${user.name}, your payment of <strong>${amount}</strong> for order <strong>#${ref}</strong> was received.</p>
        <p>We'll process your order right away and notify you when it ships.</p>
        <a href="https://brilz.netlify.app/orders.html" style="display:inline-block;padding:12px 24px;background:#0A0705;color:#fff;border-radius:8px;text-decoration:none;margin-top:16px">Track Your Order</a>
        <hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
        <p style="font-size:12px;color:#999">Brilz Investments · 0118 812 083 · collinsisco1@gmail.com</p>
      </div>`,
    });
  }

  // SMS
  if (user.phone) {
    await sendSMS({
      phone: user.phone,
      message: `Brilz: Payment of ${amount} confirmed! Order #${ref} is being processed. Track at brilz.netlify.app/orders.html`,
    });
  }
};

module.exports = { sendEmail, sendSMS, createDBNotification, sendPaymentConfirmation };
