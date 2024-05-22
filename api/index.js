const dotenv = require('dotenv');
const PineconeClient = require('@pinecone-database/pinecone').Pinecone;

dotenv.config()
const apiKey = process.env.PINECONE_APIKEY;

const config = {
  apiKey: apiKey  
}
const pineconeClient = new PineconeClient(config);

export default async function handler(req, res) {
  /*
  // Accessing the parsed JSON directly from req.body
  const data = req.body;
  console.log(data);

  const indexInfo = await pineconeClient.listIndexes();
  console.log(indexInfo);
  */

  const tempHello = "Welcome to Alfred"
  // Send a response back to the client
  ///res.status(200).send(indexInfo);
  res.status(200).send(tempHello);
}


