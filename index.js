const TelegramBot = require("node-telegram-bot-api");
const { default: mongoose } = require("mongoose");
const axios = require("axios");
const { JSDOM } = require("jsdom");
const Product = require("./models/Product.js");
const cron = require("node-cron");

require("dotenv").config();

const token = process.env.TELEGRAM_TOKEN;

const bot = new TelegramBot(token, { polling: true });

mongoose.connect(process.env.MONGO_URL);

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userInput = msg.text;

  try {
    const response = await axios.get(msg.text);
    const html = response.data;
    const dom = new JSDOM(html);

    let product = {};

    product.title = dom.window.document
      .querySelector(".product_title.entry-title")
      .textContent.trim();
    product.price = dom.window.document
      .querySelector(".summary .woocommerce-Price-amount")
      .textContent.trim();
    product.stock = dom.window.document
      .querySelector(".stock")
      .textContent.trim();
    console.log(chatId);
    const existingProduct = await Product.findOne({ url: msg.text });
    if (!existingProduct) {
      await Product.create({
        url: msg.text,
        title: product.title,
        price: product.price,
        stock: product.stock,
        chatId: chatId,
      });
      bot.sendMessage(
        chatId,
        `${product.title} ${product.price} ${product.stock} ${chatId}`
      );
    } else {
      bot.sendMessage(chatId, "Товар з таким URL вже існує у базі даних.");
    }
  } catch (error) {
    console.error("Error fetching data:", error);
  }
});

cron.schedule("*/1 * * * *", async () => {
  console.log("Починається парсинг товарів...");
  try {
    const products = await Product.find();
    for (const product of products) {
      const response = await axios.get(product.url);
      const html = response.data;
      const dom = new JSDOM(html);

      let productData = {};

      productData.title = dom.window.document
        .querySelector(".product_title.entry-title")
        .textContent.trim();
      productData.price = dom.window.document
        .querySelector(".summary .woocommerce-Price-amount")
        .textContent.trim();
      productData.stock = dom.window.document
        .querySelector(".stock")
        .textContent.trim();

      // Перевірка зміни ціни або наявності
      if (
        productData.price !== product.price ||
        productData.stock !== product.stock
      ) {
        // Оновлення даних товару у базі даних
        await Product.updateOne({ _id: product._id }, { $set: productData });

        // Відправка повідомлення тільки якщо змінилась ціна або наявність
        bot.sendMessage(
          product.chatId,
          `Дані оновлено для товару: ${product.title}`
        );
      } else {
        bot.sendMessage(
          product.chatId,
          `Дані оновлено для товару: ${product.title} ${productData.price} - ${product.price}, ${productData.stock} - ${product.stock}`
        );
      }
    }
  } catch (error) {
    console.error("Помилка під час обробки товарів:", error);
  }
});
