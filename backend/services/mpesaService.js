const axios = require('axios');
const { getMpesaToken } = require('../middleware/mpesaToken');
const { normalizePhone } = require('../utils/validators');

const BASE = process.env.MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

const formatPhone = normalizePhone;

const stkPush = async ({ phone, amount, orderId, description = 'Brilz Payment' }) => {
  const token     = await getMpesaToken();
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0,14);
  const password  = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');
  const { data }  = await axios.post(`${BASE}/mpesa/stkpush/v1/processrequest`, {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   'CustomerPayBillOnline',
    Amount:            Math.ceil(amount),
    PartyA:            formatPhone(phone),
    PartyB:            process.env.MPESA_SHORTCODE,
    PhoneNumber:       formatPhone(phone),
    CallBackURL:       process.env.MPESA_CALLBACK_URL,
    AccountReference:  `BRILZ-${(orderId||'').toString().slice(0,8).toUpperCase()}`,
    TransactionDesc:   description,
  }, { headers: { Authorization: `Bearer ${token}` } });
  return data;
};

const querySTKStatus = async (checkoutRequestId) => {
  const token     = await getMpesaToken();
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0,14);
  const password  = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');
  const { data }  = await axios.post(`${BASE}/mpesa/stkpushquery/v1/query`, {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password:          password,
    Timestamp:         timestamp,
    CheckoutRequestID: checkoutRequestId,
  }, { headers: { Authorization: `Bearer ${token}` } });
  return data;
};

module.exports = { stkPush, querySTKStatus, formatPhone };
