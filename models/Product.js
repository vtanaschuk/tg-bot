const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const productSchema = new mongoose.Schema({
  url: { type: String, unique: true }, // Поле url тепер унікальне
  title: String,
  price: String,
  stock: String,
  chatId: String,
});

const ProductModel = mongoose.model("Product", productSchema);

module.exports = ProductModel;