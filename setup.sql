const sqlSetup = `
-- Create database
CREATE DATABASE IF NOT EXISTS notes_app;
USE notes_app;

-- The tables will be created automatically by the server.js file
-- But you can run this if you want to create them manually:

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
);

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
);

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
);

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
);
`;