const supabase   = require('../config/supabase');
const { stkPush, querySTKStatus } = require('../services/mpesaService');
const { sendPaymentConfirmation } = require('../services/notificationService');
const { normalizePhone } = require('../utils/validators');
const logger = require('../config/logger');

const initiateSTKPush = async (req, res, next) => {
  try {
    const { phone, amount, order_id, type = 'order' } = req.body;
    if (!phone || !amount) return res.status(400).json({ error: 'Phone and amount are required' });
    if (amount < 1) return res.status(400).json({ error: 'Amount must be at least KSh 1' });

    const normalPhone = normalizePhone(phone);
    const result = await stkPush({ phone: normalPhone, amount: Math.ceil(amount), orderId: order_id, description: `Brilz ${type} payment` });

    if (result.ResponseCode !== '0') return res.status(400).json({ error: result.ResponseDescription || 'STK push failed' });

    // Record pending payment
    if (order_id) {
      await supabase.from('payments').insert({
        order_id, user_id: req.user?.id||null,
        amount: Math.ceil(amount), phone: normalPhone,
        checkout_request_id: result.CheckoutRequestID,
        merchant_request_id: result.MerchantRequestID,
        status: 'pending',
      });
    }

    res.json({
      message:           'STK push sent. Enter your M-Pesa PIN.',
      CheckoutRequestID: result.CheckoutRequestID,
      MerchantRequestID: result.MerchantRequestID,
    });
  } catch (e) { next(e); }
};

const mpesaCallback = async (req, res, next) => {
  try {
    const body = req.body?.Body?.stkCallback;
    if (!body) return res.json({ ResultCode: 0 });

    const { CheckoutRequestID, ResultCode, ResultDesc } = body;
    logger.info(`M-Pesa callback: ${CheckoutRequestID} — code ${ResultCode}`);

    if (ResultCode === 0) {
      // Success — extract details
      const items     = body.CallbackMetadata?.Item || [];
      const get       = (name) => items.find(i => i.Name === name)?.Value;
      const receipt   = get('MpesaReceiptNumber');
      const amount    = get('Amount');
      const phone     = get('PhoneNumber');
      const txDate    = get('TransactionDate');

      // Update payment record
      const { data: payment } = await supabase.from('payments')
        .update({ status:'completed', mpesa_receipt:receipt, result_code:0, result_desc:ResultDesc, transaction_date: String(txDate) })
        .eq('checkout_request_id', CheckoutRequestID).select('order_id,user_id').single();

      if (payment?.order_id) {
        // Update order status
        await supabase.from('orders').update({ status:'paid', mpesa_ref:receipt, paid_at: new Date().toISOString() })
          .eq('id', payment.order_id);

        // Send confirmation notifications
        const { data: order } = await supabase.from('orders').select('*').eq('id', payment.order_id).single();
        const { data: user  } = payment.user_id
          ? await supabase.from('users').select('id,name,email,phone').eq('id', payment.user_id).single()
          : { data: null };
        if (order && user) await sendPaymentConfirmation({ user, order, mpesaRef: receipt });
      }
    } else {
      // Failed
      await supabase.from('payments').update({ status:'failed', result_code:ResultCode, result_desc:ResultDesc })
        .eq('checkout_request_id', CheckoutRequestID);
    }

    res.json({ ResultCode: 0 });
  } catch (e) {
    logger.error('M-Pesa callback error:', e);
    res.json({ ResultCode: 0 }); // Always 200 to Safaricom
  }
};

const getPaymentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Check DB first
    const { data: payment } = await supabase.from('payments')
      .select('status,mpesa_receipt,amount,result_code,result_desc').eq('checkout_request_id', id).single();
    if (payment) {
      return res.json({ status: payment.status, mpesaReceiptNumber: payment.mpesa_receipt, amount: payment.amount });
    }
    // Fallback: query Safaricom
    const result = await querySTKStatus(id);
    const code   = result.ResultCode;
    res.json({ status: code === 0 ? 'completed' : code === undefined ? 'pending' : 'failed', raw: result });
  } catch (e) { next(e); }
};

const getAllPayments = async (req, res, next) => {
  try {
    const { page=1, limit=20 } = req.query;
    const { data, error, count } = await supabase.from('payments').select('*', {count:'exact'})
      .order('created_at', {ascending:false}).range((page-1)*limit, page*limit-1);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data, total: count });
  } catch (e) { next(e); }
};

module.exports = { initiateSTKPush, mpesaCallback, getPaymentStatus, getAllPayments };
