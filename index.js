const TelegramBot = require("node-telegram-bot-api");
const { default: mongoose } = require("mongoose");
const axios = require("axios");
const { JSDOM } = require("jsdom");
const Product = require("./models/Product.js");
const cron = require("node-cron");
const { ObjectId } = require("mongoose").Types;

require("dotenv").config();

const token = process.env.TELEGRAM_TOKEN;

const bot = new TelegramBot(token, { polling: true });

mongoose.connect(process.env.MONGO_URL);

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userInput = msg.text;

  // Check if the message is a command
  if (userInput.startsWith("/")) {
    // Handle commands
    switch (userInput) {
      case "/start":
        // Display the menu
        bot.sendMessage(chatId, "Welcome to the Product Tracker Bot!", {
          reply_markup: {
            keyboard: [["/show-tracked-products"], ["/add-new-product"]],
            resize_keyboard: true,
          },
        });
        break;
      case "/show-tracked-products":
        bot.sendMessage(chatId, "Show Tracked Products");

        try {
          const trackedProducts = await Product.find({ chatId: chatId });
          const totalProducts = trackedProducts.length;
          const perPage = 10;

          let startIndex = 0;
          let endIndex = perPage;
          let currentPage = 1;

          const sendProducts = async () => {
            const currentProducts = trackedProducts.slice(startIndex, endIndex);

            if (currentProducts.length > 0) {
              let message = `Tracked Products (Page ${currentPage}/${Math.ceil(
                totalProducts / perPage
              )}):\n`;
              currentProducts.forEach((product, index) => {
                message += `${index + 1}. Title: ${product.title}\nPrice: ${
                  product.price
                }\nStock: ${product.stock}\n\n`;
              });
              message += "Select an action:";

              // Створення інлайн-клавіатури
              const keyboard = {
                inline_keyboard: [
                  [
                    { text: "Previous", callback_data: "previous" },
                    { text: "Next", callback_data: "next" },
                  ],
                  ...currentProducts.map((product, index) => {
                    return [
                      {
                        text: `delete ${index + 1}`,
                        callback_data: `delete_${product._id}`,
                      },
                    ];
                  }),
                ],
              };

              bot.sendMessage(chatId, message, { reply_markup: keyboard });
            } else {
              bot.sendMessage(chatId, "No tracked products found.");
            }
          };

          // Відправляємо першу сторінку продуктів
          sendProducts();
          const callbackQueryHandler = async (callbackQuery) => {
            const action = callbackQuery.data;

            // Розділення даних відповіді для отримання ідентифікатора та дії
            const [actionType, productId] = action.split("_");

            switch (actionType) {
              case "delete":
                try {
                  await Product.findByIdAndDelete(productId);
                  bot.off("callback_query", callbackQueryHandler);
                  bot.sendMessage(chatId, `Product ${productId} deleted.`);
                  return;
                } catch (error) {
                  console.error("Error deleting product:", error);
                  bot.sendMessage(
                    chatId,
                    `Error deleting product ${productId}.`
                  );
                }
                break;
              case "previous":
                startIndex -= perPage;
                endIndex -= perPage;
                currentPage--;
                sendProducts();
                break;
              case "next":
                startIndex += perPage;
                endIndex += perPage;
                currentPage++;
                sendProducts();
                break;
            }
          };

          bot.on("callback_query", callbackQueryHandler);
        } catch (error) {
          console.error("Error fetching tracked products:", error);
          bot.sendMessage(chatId, "Error fetching tracked products.");
        }
        break;

      case "/add-new-product":
        bot.sendMessage(chatId, "Please enter the URL of the product:");

        // Додаємо обробник для відповіді користувача з URL
        bot.once("message", async (msg) => {
          const productUrl = msg.text;

          try {
            const response = await axios.get(productUrl);
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

            const existingProduct = await Product.findOne({ url: productUrl });
            if (!existingProduct) {
              await Product.create({
                url: productUrl,
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
              bot.sendMessage(
                chatId,
                "Товар з таким URL вже існує у базі даних."
              );
            }
          } catch (error) {
            console.error("Error fetching data:", error);
            bot.sendMessage(
              chatId,
              "Error fetching data from the provided URL. Please make sure it's valid."
            );
          }
        });
        break;
      case "/delete-by-id":
        bot.sendMessage(chatId, "Delete by id");

        break;
    }
  }
});

cron.schedule("*/15 * * * *", async () => {
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

      if (
        productData.price !== product.price ||
        productData.stock !== product.stock
      ) {
        if (productData.stock === "Немає в наявності") {
          await Product.findByIdAndDelete(product._id);
          bot.sendMessage(
            product.chatId,
            `Продукт "${product.title}" був видалений, оскільки він більше не доступний у магазині.`
          );
        } else {
          bot.sendMessage(
            product.chatId,
            `Дані оновлено для товару: ${product.title}. Нова ціна: ${productData.price}, Стара ціна: ${product.price}.`
          );
          await Product.updateOne({ _id: product._id }, { $set: productData });
        }
      }
    }
  } catch (error) {
    console.error("Помилка під час обробки товарів:", error);
  }
});
