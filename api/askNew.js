const dotenv = require('dotenv');
dotenv.config()

const PINECONE_API_KEY = process.env.PINECONE_APIKEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EMBEDDING_MODEL = "text-embedding-ada-002";

const PineconeClient = require('@pinecone-database/pinecone').Pinecone;
const pc = new PineconeClient({
    apiKey: PINECONE_API_KEY,
});

const OpenAI = require('openai');
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

const getEmbedding = async (chunk) => {
    const url = 'https://api.openai.com/v1/embeddings';

    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
    };

    const data = {
        'model': OPENAI_EMBEDDING_MODEL,
        'input': chunk
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
};

const queryPinecone = async (course, query, topK = 15) => {
    const index = pc.Index(course);
    const questionEmbedding = await getEmbedding(query);

    if (!questionEmbedding) return null;

    try {
        const response = await index.query({
            vector: questionEmbedding,
            topK,
            includeMetadata: true
        });
        return response;
    } catch (error) {
        console.error(`Error querying Pinecone: ${error}`);
        return null;
    }
};

const generateResponse = async (prompt) => {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [{ role: "user", content: prompt }],
        });
        return response.choices[0].message;

    } catch (error) {
        console.error(`Error generating response: ${error}`);
        return null;
    }
};

export default async function handler(req, res) {
    try {
    const data = req.body;
    const query = data.question;
    const course = data.course;

    const response = await queryPinecone(course, query);
    if (!response) {
        console.log("No response from Pinecone");
        return;
    }

    const chunks = response.matches
        .filter(match => match.metadata && match.metadata.chunk_text)
        .map(match => match.metadata.chunk_text);

    const combinedText = chunks.join(" ");

    const llmPrompt = `Based on the following information, answer the query: ${query}\n\n${combinedText}`;
    const llmResponse = await generateResponse(llmPrompt);

    let sendResponse = {
        "data":{
            answers: llmResponse,
            question: query
        }
      }

    res.status(200).send(sendResponse);
    //res.status(200).json(sendResponse);

    } catch (error) {
        console.error('Unhandled error in handler:', error);
        res.status(500).send('Internal Server Error');
    }
};

