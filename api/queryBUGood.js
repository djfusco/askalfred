const dotenv = require('dotenv');
const PineconeClient = require('@pinecone-database/pinecone').Pinecone;

const OpenAI = require('openai');
const openai = new OpenAI();

dotenv.config()
const apiKey = process.env.PINECONE_APIKEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const OPENAI_EMBEDDING_MODEL = "text-embedding-ada-002";
const PROMPT_LIMIT = 3750;                  
const CHATGPT_MODEL = "gpt-4-1106-preview";  

const config = {
  apiKey: apiKey  
}
const pineconeClient = new PineconeClient(config);


//new function
async function getEmbedding(chunk) {
    const url = 'https://api.openai.com/v1/embeddings';
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    };
    const data = {
        model: OPENAI_EMBEDDING_MODEL,
        input: chunk
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data)
        });

        const responseJson = await response.json();
        const embedding = responseJson.data[0].embedding;
        return embedding;
    } catch (error) {
        console.error('Error fetching the embedding:', error);
        return null;
    }
}

//new function
async function buildPrompt(query, contextChunks) {
    const promptStart = `Answer the question based on the context below. If you don't know the answer based on the context provided below, just respond with 'I don't know' instead of making up an answer. Don't start your response with the word 'Answer:' Context:\n`;
    const promptEnd = `\n\nQuestion: ${query}\nAnswer:`;
    let prompt = "";

    // append contexts until hitting limit
    for (let i = 1; i < contextChunks.length; i++) {
        if (contextChunks.slice(0, i).join("\n\n---\n\n").length >= PROMPT_LIMIT) {
            prompt = promptStart + contextChunks.slice(0, i - 1).join("\n\n---\n\n") + promptEnd;
            break;
        } else if (i === contextChunks.length - 1) {
            prompt = promptStart + contextChunks.join("\n\n---\n\n") + promptEnd;
        }
    }

    // Replace carriage return line feed with a single space (optional, similar to regex substitution in the original code)
    // prompt = prompt.replace(/\r\n/g, " ");
    return prompt;
}

//new function
async function constructMessagesList(chatHistory, prompt) {
    let messages = [{ "role": "system", "content": "You are a helpful assistant." }];

    // Populate the messages array with the current chat history
    for (let message of chatHistory) {
        if (message.isBot) {
            messages.push({ "role": "system", "content": message.text });
        } else {
            messages.push({ "role": "user", "content": message.text });
        }
    }

    // Replace last message with the full prompt
    messages[messages.length - 1].content = prompt;

    return messages;
}


//new function
async function constructLLMPayload(question, contextChunks, chatHistory) {
    const prompt = await buildPrompt(question, contextChunks);
    ///console.log("here are the prompt");
    ///console.log(prompt);
    //this appears to be working^^^

    const messages = await constructMessagesList(chatHistory, prompt);
    ///console.log("here are the prompt");
    ///console.log(messages);
    //this appears to be working^^^


    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
    };

    const data = {
        model: CHATGPT_MODEL,
        messages: messages,
        temperature: 1,
        maxTokens: 1000,
        stream: true
    };

    ///console.log("here are the data built");
    ///console.log(data);
    //this appears to be working^^^

    /////return { headers, data };  //orig - did not work
    return {
        headers: headers,
        returnData: data
    };
    //this works^^^
}


/* NOT NEEDED
//new function
async function generate(headersIn, dataIn) {
    const url = 'https://api.openai.com/v1/chat/completions';
    try {
        const response = await axios.post(url, dataIn, {
            headers: headersIn,
            responseType: 'stream'
        });

        console.log("here are the response");
        console.log(response);

        const eventSource = new EventSource(response.data);
        eventSource.onmessage = (event) => {
            if (event.data !== '[DONE]') {
                try {
                    const text = JSON.parse(event.data).choices[0].delta.content;
                    /////console.log(text); // You can use a yield equivalent here if needed, or handle the data as needed
                } catch (error) {
                    console.log(''); // Handle error or yield empty string as in your Python code
                }
            }
        };
    } catch (error) {
        console.error('Failed to post request:', error);
    }
}
NOT NEEDED */ 


//MAIN
export default async function handler(req, res) {
  //SUGGEST ADD
  try {
      const data = req.body;
      const question = data.question;
      const course = data.course;
      const PINECONE_INDEX_NAME = course;
      const chatHistory = "";

      //get embeddings
      const questionEmbedding = await getEmbedding(question);
      ///console.log('Embedding:', questionEmbedding);

      //now issue the query
      const index = pineconeClient.index(PINECONE_INDEX_NAME);
      //SUGGEST ADD
      //try {
        const queryResults = await index.query({ vector: questionEmbedding, topK: 3, includeMetadata: true });  
      //} catch (error) {
      //  console.error('Error querying Pinecone:', error);
      //  // Handle error appropriately, possibly with a response to the client
      //}

      
      ///console.log(queryResults);

      //now match the chunks
      const contextChunks = queryResults.matches.map(x => x.metadata.chunk_text);
      ///console.log(contextChunks);
      //WORKS up to here!
      
      const { headers, returnData } = await constructLLMPayload(question, contextChunks, chatHistory);
      ///console.log("here are the headers");
      ///console.log(headers);
      ///console.log("here are the returnData");
      ///console.log(returnData);
      //WORKS up to here!


      const content = returnData.messages[0].content;
      const stream = await openai.chat.completions.create({
        model: "gpt-4",
        //messages: [{ role: "user", content: "what is earth?" }],
        messages: [{ role: "user", content: content }],
        //messages: [{content }],
        stream: true
      });
      //streaming to stdout - not needed; works
      /////for await (const chunk of stream) {
      /////    process.stdout.write(chunk.choices[0]?.delta?.content || "");  
      /////}

      let fullResponse = '';  // Initialize an empty string to accumulate the responses

      //SUGGEST ADD
      try {
        for await (const chunk of stream) {
              const textChunk = chunk.choices[0]?.delta?.content || "";
              fullResponse += textChunk;  // Append each chunk to the full response
          }
      } catch (error) {
        console.error('Error handling the stream:', error);
        res.status(500).send('Error processing the stream');
      }

      let sendResponse = {
        "data":{
            answers: fullResponse,
            question: question
        }
      }

      res.status(200).send(sendResponse);
      ///res.status(200).send(fullResponse);
      //WORKS up to here!

      //orig output - works
      ///const indexInfo = await pineconeClient.listIndexes();
      ///console.log(indexInfo);
      ///res.status(200).send(indexInfo);

    } catch (error) {
      console.error('Unhandled error in handler:', error);
      res.status(500).send('Internal Server Error');
  }
}


