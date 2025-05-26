import express from 'express';
import nodemailer from 'nodemailer';

const router = express.Router();

router.post('/report', async (req, res) => {
  const { name, email, details } = req.body;

  if (!name || !email || !details) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'sadiqibraheem43@gmail.com',
        pass: 'rcpi ieyw hrxj msfv' // Use an App Password, not your actual Gmail password
      },
    });

    const mailOptions = {
      from: `"AwareGuard Reporter" <${email}>`,
      to: 'sadiqibraheem43@gmail.com',
      subject: '🚨 New Scam Report Submission',
      text: `
        Name: ${name}
        Email: ${email}
        Scam Details:
        ${details}
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: 'Report sent successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send report. Please try again later.' });
  }
});

export default router;
