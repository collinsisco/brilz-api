const axios = require('axios');
let _token = null, _expires = 0;

const getMpesaToken = async () => {
  if (_token && Date.now() < _expires) return _token;
  const creds = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const base  = process.env.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
  const { data } = await axios.get(`${base}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${creds}` } });
  _token   = data.access_token;
  _expires = Date.now() + (data.expires_in - 60) * 1000;
  return _token;
};

module.exports = { getMpesaToken };
