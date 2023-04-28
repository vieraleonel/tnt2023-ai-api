require("dotenv").config();
const express = require("express");
const multer = require("multer");
const upload = multer();
const cohere = require("cohere-ai");
const weaviate = require("weaviate-client");
const schemaConfig = {
  class: "Meme",
  vectorizer: "img2vec-neural",
  vectorIndexType: "hnsw",
  moduleConfig: {
    "img2vec-neural": {
      imageFields: ["image"],
    },
  },
  properties: [
    {
      name: "image",
      dataType: ["blob"],
    },
    {
      name: "text",
      dataType: ["string"],
    },
  ],
};

cohere.init(process.env.COHERE_KEY);
const app = express();
const port = 9191;

async function schemaGetter() {
  const schemaRes = await client.schema.getter().do();
  if (schemaRes.classes.length === 0) {
    const schemaCreated = await client.schema
      .classCreator()
      .withClass(schemaConfig)
      .do();

    console.log(schemaCreated);
  } else {
    console.log(schemaRes);
  }
}

const client = weaviate.client({
  scheme: "http",
  host: "weaviate:8080",
});

schemaGetter();

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/chat", (req, res) => {
  console.log(req.query);

  cohere
    .generate({
      model: "command-xlarge-nightly",
      prompt: req.query.question,
      max_tokens: 300,
      temperature: 0.9,
      k: 0,
      stop_sequences: [],
      return_likelihoods: "NONE",
    })
    .then((response) => {
      const result = response?.body?.generations[0]?.text?.trim();
      if (result === null) {
        res
          .status(500)
          .json({ error: true, mensaje: "Error al generar la respuesta" });
      }
      res.json({ error: false, mensaje: result });
    })
    .catch((err) => res.status(500).json({ error: true, mensaje: err }));
});

app.post("/image", upload.single("image"), async (req, res) => {
  // Access the uploaded image file
  const imageFile = req.file;

  // Check if an image file was received
  if (!imageFile) {
    return res.status(400).json({ error: "No image file received" });
  }

  // Access the buffer of the image file
  const b64 = imageFile.buffer.toString("base64");

  const resImage = await client.graphql
    .get()
    .withClassName("Meme")
    .withFields(["image"])
    .withNearImage({ image: b64 })
    .withLimit(1)
    .do();

  // Write result to filesystem
  const result = resImage.data.Get.Meme[0].image;
  const buffer = Buffer.from(result, "base64");

  // Set the response content type to JPEG
  res.contentType("jpeg");

  // Send the image buffer as the response
  res.send(buffer);
});

app.post("/image2vec", upload.single("image"), (req, res) => {
  // Access the uploaded image file
  const imageFile = req.file;
  const description = req.body.description;

  // Check if an image file was received
  if (!imageFile) {
    return res.status(400).json({ error: "No image file received" });
  }

  // Access the buffer of the image file
  const b64 = imageFile.buffer.toString("base64");

  client.data
    .creator()
    .withClassName("Meme")
    .withProperties({
      image: b64,
      text: description,
    })
    .do()
    .then(() => res.status(201).json({ error: false, mensaje: "added" }))
    .catch((err) => res.status(500).json({ error: true, mensaje: err }));
});

app.listen(port, () => {
  console.log(`TNT2023 api listening on port ${port}`);
});
