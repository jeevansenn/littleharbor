import crypto from 'crypto';

export default async function handler(req, res) {
  // Hanya izinkan method POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { items, totalAmount, customerName, customerEmail } = req.body;

    // Ambil Kunci Rahasia dari Vercel Environment Variables
    const clientId = process.env.DOKU_CLIENT_ID;
    const secretKey = process.env.DOKU_SECRET_KEY;

    // Generate Invoice Number Unik
    const invoiceNumber = `LH-${Date.now()}`;
    const requestTimestamp = new Date().toISOString().slice(0, 19) + "Z";
    const requestTarget = "/checkout/v1/payment";

    // Setup Payload Data Pembayaran ke Doku
    const payload = {
      order: {
        invoice_number: invoiceNumber,
        amount: totalAmount,
        line_items: items || [
          {
            name: "LITTLE HARBOR Order",
            price: totalAmount,
            quantity: 1
          }
        ]
      },
      payment: {
        payment_due_date: 60 // Masa berlaku tagihan QRIS/VA (60 menit)
      },
      customer: {
        name: customerName || "Guest Customer",
        email: customerEmail || "customer@littleharbor.com"
      }
    };

    const bodyString = JSON.stringify(payload);

    // Bikin Signature HMAC-SHA256 Sesuai Standar Keamanan Doku
    const digest = crypto
      .createHash('sha256')
      .update(bodyString)
      .digest('base64');

    const signatureRaw = `Client-Id:${clientId}\nRequest-Timestamp:${requestTimestamp}\nRequest-Target:${requestTarget}\nDigest:${digest}`;
    
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(signatureRaw)
      .digest('base64');

    // Tembak API Doku untuk Generate Payment Link Instan
    // Note: Jika akun Doku sudah Production (Live), ganti api-sandbox.doku.com jadi api.doku.com
    const dokuResponse = await fetch("https://api-sandbox.doku.com" + requestTarget, {
      method: "POST",
      headers: {
        "Client-Id": clientId,
        "Request-Timestamp": requestTimestamp,
        "Signature": `HMACSHA256=${signature}`,
        "Content-Type": "application/json"
      },
      body: bodyString
    });

    const result = await dokuResponse.json();

    if (result.response && result.response.payment && result.response.payment.url) {
      return res.status(200).json({ success: true, paymentUrl: result.response.payment.url });
    } else {
      return res.status(400).json({ success: false, error: result });
    }

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}