
// server.js
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const socketIo = require('socket.io');
const http = require('http');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Database connection
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'notes_app',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'secret_key', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Database initialization
async function initializeDatabase() {
  try {
    // Users table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        user_type ENUM('student', 'writer') NOT NULL,
        phone VARCHAR(15),
        location VARCHAR(100),
        rating DECIMAL(3,2) DEFAULT 0.00,
        total_orders INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Note requests table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS note_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        writer_id INT NULL,
        subject VARCHAR(100) NOT NULL,
        topic TEXT NOT NULL,
        note_type ENUM('handwritten', 'printed') NOT NULL,
        pages INT NOT NULL,
        deadline DATETIME NOT NULL,
        language VARCHAR(20) DEFAULT 'English',
        delivery_location VARCHAR(200) NOT NULL,
        amount DECIMAL(10,2) DEFAULT 0.00,
        payment_type ENUM('free', 'paid', 'cod') DEFAULT 'free',
        status ENUM('open', 'accepted', 'in_progress', 'ready', 'delivered', 'completed', 'cancelled') DEFAULT 'open',
        reference_files TEXT,
        special_instructions TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id),
        FOREIGN KEY (writer_id) REFERENCES users(id)
      )
    `);

    // Messages table for chat
    await db.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        sender_id INT NOT NULL,
        receiver_id INT NOT NULL,
        message TEXT NOT NULL,
        message_type ENUM('text', 'image', 'file') DEFAULT 'text',
        file_path VARCHAR(255),
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_read BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (request_id) REFERENCES note_requests(id),
        FOREIGN KEY (sender_id) REFERENCES users(id),
        FOREIGN KEY (receiver_id) REFERENCES users(id)
      )
    `);

    // Ratings table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ratings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        student_id INT NOT NULL,
        writer_id INT NOT NULL,
        rating INT CHECK (rating >= 1 AND rating <= 5),
        review TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES note_requests(id),
        FOREIGN KEY (student_id) REFERENCES users(id),
        FOREIGN KEY (writer_id) REFERENCES users(id)
      )
    `);

    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Routes

// Auth routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, user_type, phone, location } = req.body;
    
    // Check if user exists
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert user
    const [result] = await db.execute(
      'INSERT INTO users (username, email, password, user_type, phone, location) VALUES (?, ?, ?, ?, ?, ?)',
      [username, email, hashedPassword, user_type, phone, location]
    );

    const token = jwt.sign(
      { id: result.insertId, username, user_type },
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '7d' }
    );

    res.json({ 
      token, 
      user: { id: result.insertId, username, email, user_type, phone, location } 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, user_type: user.user_type },
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '7d' }
    );

    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        user_type: user.user_type,
        phone: user.phone,
        location: user.location,
        rating: user.rating,
        total_orders: user.total_orders
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Note request routes
app.post('/api/requests', authenticateToken, upload.array('reference_files', 5), async (req, res) => {
  try {
    const { subject, topic, note_type, pages, deadline, language, delivery_location, amount, payment_type, special_instructions } = req.body;
    
    let reference_files = null;
    if (req.files && req.files.length > 0) {
      reference_files = JSON.stringify(req.files.map(file => file.filename));
    }

    const [result] = await db.execute(
      `INSERT INTO note_requests (student_id, subject, topic, note_type, pages, deadline, language, 
       delivery_location, amount, payment_type, reference_files, special_instructions) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, subject, topic, note_type, pages, deadline, language, delivery_location, amount, payment_type, reference_files, special_instructions]
    );

    res.json({ id: result.insertId, message: 'Request created successfully' });
  } catch (error) {
    console.error('Request creation error:', error);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

app.get('/api/requests', authenticateToken, async (req, res) => {
  try {
    let query, params;
    
    if (req.user.user_type === 'student') {
      query = `SELECT r.*, u.username as writer_name, u.phone as writer_phone 
               FROM note_requests r 
               LEFT JOIN users u ON r.writer_id = u.id 
               WHERE r.student_id = ? 
               ORDER BY r.created_at DESC`;
      params = [req.user.id];
    } else {
      // Writer sees open requests or their accepted requests
      query = `SELECT r.*, u.username as student_name, u.phone as student_phone 
               FROM note_requests r 
               JOIN users u ON r.student_id = u.id 
               WHERE r.status = 'open' OR r.writer_id = ? 
               ORDER BY r.created_at DESC`;
      params = [req.user.id];
    }

    const [requests] = await db.execute(query, params);
    res.json(requests);
  } catch (error) {
    console.error('Fetch requests error:', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

app.post('/api/requests/:id/accept', authenticateToken, async (req, res) => {
  try {
    if (req.user.user_type !== 'writer') {
      return res.status(403).json({ error: 'Only writers can accept requests' });
    }

    const [result] = await db.execute(
      'UPDATE note_requests SET writer_id = ?, status = "accepted" WHERE id = ? AND status = "open"',
      [req.user.id, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ error: 'Request not available' });
    }

    // Get request details for notification
    const [requests] = await db.execute(
      'SELECT r.*, u.username as student_name FROM note_requests r JOIN users u ON r.student_id = u.id WHERE r.id = ?',
      [req.params.id]
    );

    if (requests.length > 0) {
      io.emit('request_accepted', {
        request_id: req.params.id,
        student_id: requests[0].student_id,
        writer_id: req.user.id,
        writer_name: req.user.username
      });
    }

    res.json({ message: 'Request accepted successfully' });
  } catch (error) {
    console.error('Accept request error:', error);
    res.status(500).json({ error: 'Failed to accept request' });
  }
});

app.post('/api/requests/:id/update-status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['in_progress', 'ready', 'delivered', 'completed', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const [result] = await db.execute(
      'UPDATE note_requests SET status = ? WHERE id = ? AND (writer_id = ? OR student_id = ?)',
      [status, req.params.id, req.user.id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ error: 'Request not found or unauthorized' });
    }

    // Emit status update
    io.emit('status_updated', {
      request_id: req.params.id,
      status: status,
      updated_by: req.user.id
    });

    res.json({ message: 'Status updated successfully' });
  } catch (error) {
    console.error('Status update error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Chat routes
app.get('/api/chat/:requestId', authenticateToken, async (req, res) => {
  try {
    const [messages] = await db.execute(
      `SELECT m.*, u.username as sender_name 
       FROM messages m 
       JOIN users u ON m.sender_id = u.id 
       WHERE m.request_id = ? 
       ORDER BY m.timestamp ASC`,
      [req.params.requestId]
    );

    // Mark messages as read
    await db.execute(
      'UPDATE messages SET is_read = TRUE WHERE request_id = ? AND receiver_id = ?',
      [req.params.requestId, req.user.id]
    );

    res.json(messages);
  } catch (error) {
    console.error('Fetch messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.post('/api/chat/:requestId', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { message, receiver_id } = req.body;
    let message_type = 'text';
    let file_path = null;

    if (req.file) {
      message_type = req.file.mimetype.startsWith('image/') ? 'image' : 'file';
      file_path = req.file.filename;
    }

    const [result] = await db.execute(
      `INSERT INTO messages (request_id, sender_id, receiver_id, message, message_type, file_path) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.requestId, req.user.id, receiver_id, message || '', message_type, file_path]
    );

    const newMessage = {
      id: result.insertId,
      request_id: req.params.requestId,
      sender_id: req.user.id,
      receiver_id: receiver_id,
      message: message || '',
      message_type: message_type,
      file_path: file_path,
      sender_name: req.user.username,
      timestamp: new Date()
    };

    // Emit to specific room
    io.to(`request_${req.params.requestId}`).emit('new_message', newMessage);

    res.json(newMessage);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Rating route
app.post('/api/requests/:id/rate', authenticateToken, async (req, res) => {
  try {
    const { rating, review } = req.body;
    
    if (req.user.user_type !== 'student') {
      return res.status(403).json({ error: 'Only students can rate' });
    }

    // Get request details
    const [requests] = await db.execute(
      'SELECT writer_id FROM note_requests WHERE id = ? AND student_id = ? AND status = "completed"',
      [req.params.id, req.user.id]
    );

    if (requests.length === 0) {
      return res.status(400).json({ error: 'Request not found or not completed' });
    }

    const writer_id = requests[0].writer_id;

    // Insert rating
    await db.execute(
      'INSERT INTO ratings (request_id, student_id, writer_id, rating, review) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, req.user.id, writer_id, rating, review]
    );

    // Update writer's average rating
    const [ratings] = await db.execute(
      'SELECT AVG(rating) as avg_rating, COUNT(*) as total FROM ratings WHERE writer_id = ?',
      [writer_id]
    );

    await db.execute(
      'UPDATE users SET rating = ?, total_orders = ? WHERE id = ?',
      [ratings[0].avg_rating, ratings[0].total, writer_id]
    );

    res.json({ message: 'Rating submitted successfully' });
  } catch (error) {
    console.error('Rating error:', error);
    res.status(500).json({ error: 'Failed to submit rating' });
  }
});

// Socket.io for real-time chat
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_request', (requestId) => {
    socket.join(`request_${requestId}`);
    console.log(`User joined request room: request_${requestId}`);
  });

  socket.on('leave_request', (requestId) => {
    socket.leave(`request_${requestId}`);
    console.log(`User left request room: request_${requestId}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Serve static files
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database and start server
const PORT = process.env.PORT || 3000;

initializeDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
