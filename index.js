require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
const axios = require('axios');
const crypto = require('crypto');
const Queue = require('better-queue');
const { MongoClient } = require('mongodb');
const QRCode = require('qrcode');

const app = express();
const port = process.env.PORT || 3000;

// Add health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Add CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Serve static files from the correct directory
app.use(express.static('public'));
app.use('/generated', express.static('public/generated'));
app.use('/images', express.static('public/images'));
app.use(express.json());

// Add this middleware to properly serve static files with correct content type
app.use('/generated', (req, res, next) => {
    const ext = path.extname(req.path).toLowerCase();
    const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    res.set('Content-Type', contentType);
    next();
});

// Serve the main page
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => {
    res.render('index', { quotes: [] });  // Pass any data your template needs
});

// Add these prompt configurations at the top of your file
const INSPIRATION_TYPES = {
    nature: {
        quote: "You are an inspirational quote generator. Generate a short, powerful inspirational quote (maximum 125 characters) without attribution. Make it impactful but concise.",
        image: "Create a calming, inspirational nature scene. Use soft colors, perfect for meditation and reflection. Make it serene and peaceful."
    },
    cat: {
        quote: "You are a cute and wholesome quote generator. Create a sweet, heartwarming quote about cats (maximum 125 characters) that makes people smile. Make it cute and uplifting.",
        image: "Create ONE SINGLE IMAGE containing exactly ONE hyperrealistic fantasy cat. The cat should be the sole subject, with glowing eyes and fur illuminated by soft, ethereal lighting. Include intricate details in fur texture and a magical, mystical aura. Place this single cat in one of these scenarios (choose one only): 1) perched on a crystal throne with aurora borealis in background, 2) walking through a mystical forest with floating orbs of light, 3) sitting in a ancient library with floating books and magical dust, 4) on a cloud castle with rainbow bridges, 5) near a magical pond with glowing lotus flowers, 6) in a starlit galaxy garden with nebula flowers. CRITICAL: Generate only ONE image with ONE cat. Do not create variations or multiple images."
    },
    dog: {
        quote: "You are a playful and loving quote generator. Create an endearing quote about dogs (maximum 125 characters) that celebrates their loyalty and love. Make it touching and sweet.",
        image: "Create an adorable anime-style dog in a heartwarming scene, exactly 1024x1024 pixels, perfect square format. Make it cute and lovable with warm, friendly colors. The dog should be the main focus, composed perfectly for a square frame."
    },
    fox: {
        quote: "You are a clever and whimsical quote generator. Create an enchanting quote about foxes or wisdom (maximum 125 characters) that captures their mysterious nature.",
        image: "Create a hyperrealistic magical fox with glowing eyes in a mystical forest setting, exactly 1024x1024 pixels, perfect square format. Add ethereal lighting and floating spirit wisps around the fox. Include aurora effects and magical elements, ensuring the composition fits perfectly in a square frame."
    },
    owl: {
        quote: "You are a wise and mysterious quote generator. Create an insightful quote about wisdom or night (maximum 125 characters) that reflects deep understanding.",
        image: "Create a majestic hyperrealistic owl perched in an ancient magical tree, exactly 1024x1024 pixels, perfect square format. Include glowing eyes and ethereal moonlight. Add floating magical runes and mystical elements in the background, composed perfectly for a square frame."
    },
    dragon: {
        quote: "You are an epic and powerful quote generator. Create an inspiring quote about strength and magic (maximum 125 characters) that awakens the inner dragon.",
        image: "Create a beautiful friendly fantasy dragon in a magical crystalline cave, exactly 1024x1024 pixels, perfect square format. Include gentle eyes and iridescent scales. Add floating magical orbs and ethereal mist, ensuring the composition fits perfectly in a square frame."
    },
    unicorn: {
        quote: "You are a magical and pure quote generator. Create an uplifting quote about dreams and magic (maximum 125 characters) that sparkles with hope.",
        image: "Create a ethereal unicorn in a magical rainbow forest, exactly 1024x1024 pixels, perfect square format. Include flowing mane and magical aura. Add floating butterflies and sparkles of magic, composed perfectly for a square frame."
    }
};

// Add queue configuration
const generateQueue = new Queue(async function(task, cb) {
    try {
        const result = await processGenerateRequest(task.req, task.res);
        cb(null, result);
    } catch (error) {
        cb(error);
    }
}, {
    concurrent: 1,
    afterProcessDelay: 10000  // 10 seconds delay between tasks
});

// Keep track of queue position for each request
let queuePosition = 0;
generateQueue.on('task_queued', () => {
    queuePosition++;
});
generateQueue.on('task_finish', () => {
    queuePosition = Math.max(0, queuePosition - 1);
});

// Add this function to check and create required directories
async function ensureDirectories() {
    const dirs = [
        'public',
        'public/generated',
        'public/images',
        'public/js',
        'public/css'
    ];

    for (const dir of dirs) {
        try {
            await fs.mkdir(dir, { recursive: true });
        } catch (err) {
            console.log(`Directory ${dir} already exists or error:`, err);
        }
    }
}

// Add this function at the top level
async function getDallEImage(userPrompt, config = {}) {
    const defaultConfig = {
        imageDimension: "1024x1024",
        imageQuality: "standard",
        model: "dall-e-3",
        nbFinalImage: 1,
        style: "vivid"
    };

    const finalConfig = { ...defaultConfig, ...config };

    return await openai.images.generate({
        model: finalConfig.model,
        prompt: userPrompt,
        size: finalConfig.imageDimension,
        quality: finalConfig.imageQuality,
        n: finalConfig.nbFinalImage,
        style: finalConfig.style
    });
}

// Move the generation logic to a separate function
async function processGenerateRequest(req, res) {
    try {
        console.log('Starting generation...');
        
        // Determine the type of inspiration
        let type = req.body.type || 'nature';
        let promptConfig;  // Declare promptConfig at the start

        if (type === 'surprise') {
            // Expanded list of all possible types for surprise option
            const allTypes = [
                'nature',
                {
                    type: 'cat',
                    variant: "Create ONE SINGLE IMAGE containing exactly ONE majestic space cat. The cat should be wearing a crystalline space helmet and be the sole focus, surrounded by floating galaxies and star clusters. Maintain hyperrealistic quality with fantasy elements. CRITICAL: Generate only ONE image with ONE cat. Do not create variations or multiple images."
                },
                {
                    type: 'dog',
                    variant: "Create a single magical wizard dog (just one dog) wearing enchanted robes, casting spells in an ancient library. The dog should be the sole focus, with floating books and magical particles around it. Maintain cute and magical style. Square format. Important: Show only ONE dog in the scene."
                },
                {
                    type: 'fox',
                    variant: "Create a single mystical fox (just one fox) with ethereal glowing eyes in an enchanted crystal cave. The fox should be the sole focus, surrounded by floating spirit wisps and aurora effects. Square format. Important: Show only ONE fox in the scene."
                },
                {
                    type: 'owl',
                    variant: "Create a single majestic owl (just one owl) perched on a glowing crystal branch under a cosmic sky. The owl should be the sole focus, with magical runes and stardust floating around it. Square format. Important: Show only ONE owl in the scene."
                },
                {
                    type: 'dragon',
                    variant: "Create a single friendly baby dragon (just one dragon) with iridescent scales in a magical crystal garden. The dragon should be the sole focus, with floating orbs of light and ethereal mist around it. Square format. Important: Show only ONE dragon in the scene."
                },
                {
                    type: 'unicorn',
                    variant: "Create a single ethereal unicorn (just one unicorn) in a magical starlit clearing. The unicorn should be the sole focus, with rainbow aurora and magical butterflies around it. Square format. Important: Show only ONE unicorn in the scene."
                }
            ];
            
            // Randomly select from all types
            const selected = allTypes[Math.floor(Math.random() * allTypes.length)];
            
            // Handle both simple types and variant objects
            if (typeof selected === 'string') {
                type = selected;
                promptConfig = INSPIRATION_TYPES[type];
            } else {
                type = selected.type;
                // Create variant prompt config
                promptConfig = {
                    quote: INSPIRATION_TYPES[selected.type].quote,
                    image: selected.variant
                };
                console.log('Using variant prompt for:', type);
            }
        } else {
            promptConfig = INSPIRATION_TYPES[type];
        }

        // Generate quote using OpenAI
        const completion = await openai.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: promptConfig.quote
                },
                {
                    role: "user",
                    content: "Generate a quote"
                }
            ],
            model: "gpt-4",
            max_tokens: 60,
            temperature: 0.7,
        });

        console.log('Quote generated:', completion.choices[0].message.content);

        // Generate image using DALL-E with separated configuration
        console.log('Starting image generation...');
        const dalleResponse = await getDallEImage(promptConfig.image, {
            imageQuality: "hd",
            nbFinalImage: 1
        });

        console.log('Image URL received:', dalleResponse.data[0].url);

        // Download and process the image
        const imageUrl = dalleResponse.data[0].url;
        const axiosResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(axiosResponse.data);

        // Save image with proper PNG encoding and ensure directory exists
        const generatedDir = path.join(__dirname, 'inspirational-ai-world-main', 'public', 'generated');
        await fs.mkdir(generatedDir, { recursive: true });
        
        const timestamp = Date.now();
        const uniqueId = crypto.randomBytes(8).toString('hex');
        const filename = `${timestamp}-${uniqueId}.jpg`;
        const imagePath = path.join(generatedDir, filename);
        
        await sharp(imageBuffer)
            .jpeg({ quality: 90 })
            .toFile(imagePath);

        // Update archive logic to handle concurrent access
        if (req.body.previousImage) {
            const previousImagePath = req.body.previousImage.split('/').pop();
            if (previousImagePath) {
                const sourcePath = path.join(__dirname, 'inspirational-ai-world-main', 'public', 'generated', previousImagePath);
                const archivePath = path.join(__dirname, 'inspirational-ai-world-main', 'public', 'generated', 'archive', previousImagePath);
                try {
                    await fs.mkdir(path.join(__dirname, 'inspirational-ai-world-main', 'public', 'generated', 'archive'), { recursive: true });
                    // Use copyFile then unlink instead of rename to avoid race conditions
                    await fs.copyFile(sourcePath, archivePath);
                    await fs.unlink(sourcePath).catch(err => console.log('File already removed:', err));
                } catch (err) {
                    console.log('Error handling archive operation:', err);
                    // Continue execution even if archiving fails
                }
            }
        }

        // Return the results with the unique filename
        return {
            quote: completion.choices[0].message.content,
            imagePath: `/generated/${filename}`
        };

    } catch (error) {
        throw error;
    }
}

// Update the endpoint to use the queue
app.post('/api/generate', async (req, res) => {
    try {
        const position = generateQueue.length;
        const waitTime = position * 10; // 10 seconds per queued request

        // Send initial response with queue information
        if (position > 0) {
            res.json({ 
                status: 'queued',
                position: position,
                estimatedWait: waitTime
            });
            return;
        }

        // Process request immediately if no queue
        const result = await processGenerateRequest(req, res);
        res.json(result);

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: 'Error generating content',
            details: error.message
        });
    }
});

// Webhook secret from Buy Me a Coffee dashboard
const BUYMEACOFFEE_WEBHOOK_SECRET = process.env.BUYMEACOFFEE_WEBHOOK_SECRET;

const mongoUri = process.env.MONGODB_URI;
const client = new MongoClient(mongoUri);
let db;

async function connectDB() {
    try {
        // Comment these lines temporarily if having MongoDB issues
        // await client.connect();
        // db = client.db('inspirational-ai');
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        console.log('Continuing without MongoDB - payment features will be disabled');
    }
}

// Add this to your webhook endpoint
app.post('/webhook/buymeacoffee', express.json(), async (req, res) => {
    try {
        const { amount, email, transaction_id } = req.body;
        
        // Store transaction in database
        await db.collection('transactions').insertOne({
            transaction_id,
            email,
            amount,
            coins: calculateCoins(amount),
            processed: false,
            created_at: new Date()
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add payment check endpoint
app.post('/api/check-payment', express.json(), async (req, res) => {
    try {
        const { email } = req.body;
        
        // Find unprocessed transaction for this email
        const transaction = await db.collection('transactions')
            .findOne({ 
                email, 
                processed: false,
                created_at: { $gte: new Date(Date.now() - 300000) } // Last 5 minutes
            });
        
        if (transaction) {
            // Mark as processed
            await db.collection('transactions')
                .updateOne(
                    { _id: transaction._id },
                    { $set: { processed: true } }
                );
                
            return res.json({ 
                success: true, 
                coins: transaction.coins 
            });
        }

        res.json({ success: false });
    } catch (error) {
        console.error('Payment check error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add this function to calculate coins based on payment amount
function calculateCoins(amount) {
    switch (parseFloat(amount)) {
        case 1:
            return 4;  // Small Coffee = 4 coins
        case 3:
            return 15; // Medium Coffee = 15 coins
        case 5:
            return 30; // Big Coffee = 30 coins
        default:
            return Math.floor(amount * 4); // Default: 4 coins per euro
    }
}

// Add IP tracking for initial coins
const initializedIPs = new Set();

// Add middleware to check IP and initialize coins
app.use((req, res, next) => {
    // Get IP from various possible headers
    const clientIP = req.headers['x-forwarded-for'] || 
                    req.headers['x-real-ip'] || 
                    req.connection.remoteAddress || 
                    req.ip;
    console.log('Client IP:', clientIP); // Add this to debug
    res.locals.clientIP = clientIP;
    next();
});

// Add your IP address at the top of the file
const UNLIMITED_COINS_IP = '84.198.45.36'; // Your IP address

// Modify the initialization endpoint
app.post('/api/initialize-coins', async (req, res) => {
    const clientIP = res.locals.clientIP;
    console.log('Checking IP:', clientIP, 'Against:', UNLIMITED_COINS_IP); // Debug log
    
    // Check if it's your IP
    if (clientIP && clientIP.includes(UNLIMITED_COINS_IP)) {
        console.log('10 coins granted!'); // Debug log
        res.json({ coins: 10 });
        return;
    }

    // Normal logic for other IPs
    if (!initializedIPs.has(clientIP)) {
        initializedIPs.add(clientIP);
        res.json({ coins: 1 });
    } else {
        res.json({ coins: 0 });
    }
});

// Function to generate and save QR code
async function generateQRCode() {
    const qrCodePath = path.join('public', 'images', 'bmc-qr.png');
    try {
        await fs.mkdir(path.dirname(qrCodePath), { recursive: true });
        await QRCode.toFile(qrCodePath, 'https://buymeacoffee.com/itiswhatitisai', {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });
        console.log('QR code generated successfully');
    } catch (error) {
        console.error('Error generating QR code:', error);
    }
}

// Start server with database connection
app.listen(port, '0.0.0.0', async () => {
    await connectDB();
    await ensureDirectories();
    await generateQRCode();
    console.log(`Server running at http://localhost:${port}`);
}); 