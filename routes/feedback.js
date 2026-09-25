const express = require('express');
const rateLimit = require('express-rate-limit');
const { db } = require('../db/init');

const router = express.Router();

const ALLOWED_CATEGORIES = [
  'Checkout speed',
  'Product availability',
  'Staff friendliness',
  'Cleanliness & hygiene',
  'Pricing',
  'Other',
];
const ALLOWED_TYPES = ['compliment', 'complaint', 'suggestion'];

// Prevent the public form being used to spam the database.
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions from this device. Please try again later.' },
});

router.post('/', submitLimiter, async (req, res, next) => {
  try {
    const {
      branch_id,
      rating,
      type,
      category,
      message,
      price_product,
      price_uchumi,
      price_elsewhere,
      price_elsewhere_shop,
      customer_name,
      customer_phone,
      customer_email,
      consent_given,
      website, // honeypot field — real users never fill this in
    } = req.body || {};

    // Silently accept-and-drop suspected bot submissions instead of telling
    // the bot what tripped it.
    if (website) {
      return res.status(201).json({ ok: true });
    }

    const errors = [];

    const branchResult = await db.execute({
      sql: 'SELECT id FROM branches WHERE id = :id',
      args: { id: Number(branch_id) },
    });
    const branch = branchResult.rows[0];
    if (!branch) errors.push('Please choose a valid branch.');

    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      errors.push('Please give a rating from 1 to 5.');
    }

    if (!ALLOWED_TYPES.includes(type)) errors.push('Please choose a feedback type.');
    if (!ALLOWED_CATEGORIES.includes(category)) errors.push('Please choose a category.');

    const trimmedMessage = String(message || '').trim();
    if (trimmedMessage.length < 5 || trimmedMessage.length > 2000) {
      errors.push('Please tell us a little more (5–2000 characters).');
    }

    const isPricing = category === 'Pricing';
    if (isPricing && !String(price_product || '').trim()) {
      errors.push('Please tell us which product this is about.');
    }

    const hasContactInfo = Boolean(customer_name || customer_phone || customer_email);
    if (hasContactInfo && !consent_given) {
      errors.push('Please tick the consent box if you would like us to follow up with you.');
    }

    if (errors.length) {
      return res.status(400).json({ error: errors[0], errors });
    }

    const info = await db.execute({
      sql: `
        INSERT INTO feedback
          (branch_id, rating, type, category, message,
           price_product, price_uchumi, price_elsewhere, price_elsewhere_shop,
           customer_name, customer_phone, customer_email, consent_given)
        VALUES (:branch_id, :rating, :type, :category, :message,
                :price_product, :price_uchumi, :price_elsewhere, :price_elsewhere_shop,
                :customer_name, :customer_phone, :customer_email, :consent_given)
      `,
      args: {
        branch_id: branch.id,
        rating: ratingNum,
        type,
        category,
        message: trimmedMessage,
        price_product: isPricing && price_product ? String(price_product).trim().slice(0, 150) : null,
        price_uchumi: isPricing && price_uchumi ? String(price_uchumi).trim().slice(0, 30) : null,
        price_elsewhere: isPricing && price_elsewhere ? String(price_elsewhere).trim().slice(0, 30) : null,
        price_elsewhere_shop: isPricing && price_elsewhere_shop ? String(price_elsewhere_shop).trim().slice(0, 150) : null,
        customer_name: customer_name ? String(customer_name).trim().slice(0, 200) : null,
        customer_phone: customer_phone ? String(customer_phone).trim().slice(0, 50) : null,
        customer_email: customer_email ? String(customer_email).trim().slice(0, 200) : null,
        consent_given: hasContactInfo && consent_given ? 1 : 0,
      },
    });

    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
