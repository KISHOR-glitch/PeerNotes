class NotesApp {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user') || 'null');
        this.socket = io();
        this.currentChatRequestId = null;
        this.currentChatReceiverId = null;
        this.selectedRating = 0;
        this.currentRatingRequestId = null;

        this.initializeEventListeners();
        this.initializeSocket();
        
        if (this.token && this.user) {
            this.showDashboard();
            this.loadRequests();
        } else {
            this.showLogin();
        }
    }

    initializeEventListeners() {
        // Auth forms
        document.getElementById('loginFormElement').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('registerFormElement').addEventListener('submit', (e) => this.handleRegister(e));
        
        // Navigation
        document.getElementById('loginBtn').addEventListener('click', () => this.showLogin());
        document.getElementById('registerBtn').addEventListener('click', () => this.showRegister());
        document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());
        document.getElementById('showRegister').addEventListener('click', () => this.showRegister());
        document.getElementById('showLogin').addEventListener('click', () => this.showLogin());

        // Student dashboard
        document.getElementById('newRequestBtn').addEventListener('click', () => this.showNewRequestForm());
        document.getElementById('cancelRequest').addEventListener('click', () => this.hideNewRequestForm());
        document.getElementById('requestFormElement').addEventListener('submit', (e) => this.handleNewRequest(e));

        // Writer dashboard
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Chat modal
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        document.getElementById('attachBtn').addEventListener('click', () => {
            document.getElementById('chatFile').click();
        });
        document.getElementById('chatFile').addEventListener('change', (e) => this.handleFileUpload(e));

        // Rating modal
        document.querySelectorAll('.star').forEach(star => {
            star.addEventListener('click', (e) => this.selectRating(parseInt(e.target.dataset.rating)));
        });
        document.getElementById('submitRating').addEventListener('click', () => this.submitRating());

        // Modal close buttons
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                e.target.closest('.modal').style.display = 'none';
            });
        });

        // Close modals when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });
    }

    initializeSocket() {
        this.socket.on('request_accepted', (data) => {
            if (this.user && data.student_id === this.user.id) {
                this.showAlert(`Your request has been accepted by ${data.writer_name}!`, 'success');
                this.loadRequests();
            }
        });

        this.socket.on('status_updated', (data) => {
            this.loadRequests();
        });

        this.socket.on('new_message', (message) => {
            if (this.currentChatRequestId == message.request_id) {
                this.displayMessage(message);
            }
            // You could add notification logic here
        });
    }

    async apiCall(endpoint, options = {}) {
        const config = {
            headers: {
                'Content-Type': 'application/json',
            },
            ...options
        };

        if (this.token) {
            config.headers['Authorization'] = `Bearer ${this.token}`;
        }

        if (options.body && !(options.body instanceof FormData)) {
            config.body = JSON.stringify(options.body);
        } else if (options.body instanceof FormData) {
            delete config.headers['Content-Type'];
        }

        try {
            const response = await fetch(endpoint, config);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Something went wrong');
            }
            
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const data = await this.apiCall('/api/login', {
                method: 'POST',
                body: { email, password }
            });

            this.token = data.token;
            this.user = data.user;
            localStorage.setItem('token', this.token);
            localStorage.setItem('user', JSON.stringify(this.user));

            this.showDashboard();
            this.loadRequests();
            this.showAlert('Login successful!', 'success');
        } catch (error) {
            this.showAlert(error.message, 'error');
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        
        const formData = {
            username: document.getElementById('registerUsername').value,
            email: document.getElementById('registerEmail').value,
            password: document.getElementById('registerPassword').value,
            user_type: document.getElementById('registerUserType').value,
            phone: document.getElementById('registerPhone').value,
            location: document.getElementById('registerLocation').value
        };

        try {
            const data = await this.apiCall('/api/register', {
                method: 'POST',
                body: formData
            });

            this.token = data.token;
            this.user = data.user;
            localStorage.setItem('token', this.token);
            localStorage.setItem('user', JSON.stringify(this.user));

            this.showDashboard();
            this.loadRequests();
            this.showAlert('Registration successful!', 'success');
        } catch (error) {
            this.showAlert(error.message, 'error');
        }
    }

    handleLogout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        this.showLogin();
        this.showAlert('Logged out successfully!', 'info');
    }

    showLogin() {
        this.hideAllSections();
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('registerBtn').style.display = 'inline-block';
    }

    showRegister() {
        this.hideAllSections();
        document.getElementById('registerForm').style.display = 'block';
        document.getElementById('loginBtn').style.display = 'inline-block';
        document.getElementById('registerBtn').style.display = 'none';
    }

    showDashboard() {
        this.hideAllSections();
        
        if (this.user.user_type === 'student') {
            document.getElementById('studentDashboard').style.display = 'block';
        } else {
            document.getElementById('writerDashboard').style.display = 'block';
            document.getElementById('writerRating').textContent = this.user.rating || '0.0';
            document.getElementById('writerOrders').textContent = this.user.total_orders || '0';
        }

        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('registerBtn').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'inline-block';
        document.getElementById('userInfo').style.display = 'inline-block';
        document.getElementById('userInfo').textContent = `Welcome, ${this.user.username}!`;
    }

    hideAllSections() {
        const sections = ['loginForm', 'registerForm', 'studentDashboard', 'writerDashboard'];
        sections.forEach(section => {
            document.getElementById(section).style.display = 'none';
        });
    }

    showNewRequestForm() {
        document.getElementById('newRequestForm').style.display = 'block';
        // Set minimum deadline to current time
        const now = new Date();
        now.setHours(now.getHours() + 1); // Minimum 1 hour from now
        document.getElementById('requestDeadline').min = now.toISOString().slice(0, 16);
    }

    hideNewRequestForm() {
        document.getElementById('newRequestForm').style.display = 'none';
        document.getElementById('requestFormElement').reset();
    }

    async handleNewRequest(e) {
        e.preventDefault();
        
        const formData = new FormData();
        formData.append('subject', document.getElementById('requestSubject').value);
        formData.append('topic', document.getElementById('requestTopic').value);
        formData.append('note_type', document.getElementById('requestType').value);
        formData.append('pages', document.getElementById('requestPages').value);
        formData.append('deadline', document.getElementById('requestDeadline').value);
        formData.append('language', document.getElementById('requestLanguage').value);
        formData.append('delivery_location', document.getElementById('requestLocation').value);
        formData.append('payment_type', document.getElementById('requestPaymentType').value);
        formData.append('amount', document.getElementById('requestAmount').value || '0');
        formData.append('special_instructions', document.getElementById('requestInstructions').value);

        const files = document.getElementById('requestFiles').files;
        for (let i = 0; i < files.length; i++) {
            formData.append('reference_files', files[i]);
        }

        try {
            await this.apiCall('/api/requests', {
                method: 'POST',
                body: formData
            });

            this.hideNewRequestForm();
            this.loadRequests();
            this.showAlert('Request created successfully!', 'success');
        } catch (error) {
            this.showAlert(error.message, 'error');
        }
    }

    async loadRequests() {
        try {
            const requests = await this.apiCall('/api/requests');
            
            if (this.user.user_type === 'student') {
                this.displayStudentRequests(requests);
            } else {
                this.displayWriterRequests(requests);
            }
        } catch (error) {
            this.showAlert('Failed to load requests', 'error');
        }
    }

    displayStudentRequests(requests) {
        const container = document.getElementById('requestsList');
        
        if (requests.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📝</div>
                    <p>No requests yet. Create your first request!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = requests.map(request => this.createRequestCard(request, 'student')).join('');
    }

    displayWriterRequests(requests) {
        const availableRequests = requests.filter(r => r.status === 'open');
        const myWork = requests.filter(r => r.writer_id === this.user.id);

        document.getElementById('availableRequestsList').innerHTML = 
            availableRequests.length ? availableRequests.map(request => this.createRequestCard(request, 'writer')).join('') :
            `<div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <p>No available requests at the moment.</p>
            </div>`;

        document.getElementById('myWorkList').innerHTML = 
            myWork.length ? myWork.map(request => this.createRequestCard(request, 'writer')).join('') :
            `<div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <p>No accepted work yet.</p>
            </div>`;
    }

    createRequestCard(request, userType) {
        const formatDate = (dateString) => {
            return new Date(dateString).toLocaleString();
        };

        const statusColors = {
            'open': 'status-open',
            'accepted': 'status-accepted',
            'in_progress': 'status-in_progress',
            'ready': 'status-ready',
            'delivered': 'status-delivered',
            'completed': 'status-completed',
            'cancelled': 'status-cancelled'
        };

        let actions = '';
        
        if (userType === 'writer' && request.status === 'open') {
            actions = `<button class="btn btn-accept" onclick="app.acceptRequest(${request.id})">Accept Request</button>`;
        } else if (userType === 'writer' && request.writer_id === this.user.id) {
            actions = `
                <button class="btn btn-chat" onclick="app.openChat(${request.id}, ${request.student_id})">Chat with Student</button>
                ${request.status === 'accepted' ? `<button class="btn btn-status" onclick="app.updateStatus(${request.id}, 'in_progress')">Start Work</button>` : ''}
                ${request.status === 'in_progress' ? `<button class="btn btn-status" onclick="app.updateStatus(${request.id}, 'ready')">Mark Ready</button>` : ''}
                ${request.status === 'ready' ? `<button class="btn btn-status" onclick="app.updateStatus(${request.id}, 'delivered')">Mark Delivered</button>` : ''}
            `;
        } else if (userType === 'student' && request.writer_id) {
            actions = `
                <button class="btn btn-chat" onclick="app.openChat(${request.id}, ${request.writer_id})">Chat with Writer</button>
                ${request.status === 'delivered' ? `<button class="btn btn-status" onclick="app.updateStatus(${request.id}, 'completed')">Confirm Received</button>` : ''}
                ${request.status === 'completed' ? `<button class="btn btn-rate" onclick="app.openRating(${request.id})">Rate Writer</button>` : ''}
            `;
        }

        return `
            <div class="request-card">
                <div class="request-header">
                    <div class="request-title">${request.subject}</div>
                    <div class="status-badge ${statusColors[request.status]}">${request.status}</div>
                </div>
                <div class="request-details">
                    <div class="request-detail">📚 <strong>Topic:</strong> ${request.topic}</div>
                    <div class="request-detail">📄 <strong>Pages:</strong> ${request.pages}</div>
                    <div class="request-detail">✍️ <strong>Type:</strong> ${request.note_type}</div>
                    <div class="request-detail">🕒 <strong>Deadline:</strong> ${formatDate(request.deadline)}</div>
                    <div class="request-detail">🌐 <strong>Language:</strong> ${request.language}</div>
                    <div class="request-detail">📍 <strong>Location:</strong> ${request.delivery_location}</div>
                    ${request.amount > 0 ? `<div class="request-detail">💰 <strong>Amount:</strong> ₹${request.amount}</div>` : ''}
                    ${request.writer_name ? `<div class="request-detail">✍️ <strong>Writer:</strong> ${request.writer_name}</div>` : ''}
                    ${request.student_name ? `<div class="request-detail">👨‍🎓 <strong>Student:</strong> ${request.student_name}</div>` : ''}
                </div>
                ${request.special_instructions ? `<div class="request-detail"><strong>Instructions:</strong> ${request.special_instructions}</div>` : ''}
                ${actions ? `<div class="request-actions">${actions}</div>` : ''}
            </div>
        `;
    }

    async acceptRequest(requestId) {
        try {
            await this.apiCall(`/api/requests/${requestId}/accept`, {
                method: 'POST'
            });
            
            this.loadRequests();
            this.showAlert('Request accepted successfully!', 'success');
        } catch (error) {
            this.showAlert(error.message, 'error');
        }
    }

    async updateStatus(requestId, status) {
        try {
            await this.apiCall(`/api/requests/${requestId}/update-status`, {
                method: 'POST',
                body: { status }
            });
            
            this.loadRequests();
            this.showAlert('Status updated successfully!', 'success');
        } catch (error) {
            this.showAlert(error.message, 'error');
        }
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(tabName === 'available' ? 'availableRequests' : 'myWork').classList.add('active');
    }

    async openChat(requestId, receiverId) {
        this.currentChatRequestId = requestId;
        this.currentChatReceiverId = receiverId;
        
        document.getElementById('chatModal').style.display = 'block';
        document.getElementById('chatTitle').textContent = `Chat - Request #${requestId}`;
        
        // Join socket room
        this.socket.emit('join_request', requestId);
        
        // Load messages
        await this.loadMessages();
    }

    async loadMessages() {
        try {
            const messages = await this.apiCall(`/api/chat/${this.currentChatRequestId}`);
            const container = document.getElementById('chatMessages');
            container.innerHTML = '';
            
            messages.forEach(message => this.displayMessage(message));
            
            // Scroll to bottom
            container.scrollTop = container.scrollHeight;
        } catch (error) {
            this.showAlert('Failed to load messages', 'error');
        }
    }

    displayMessage(message) {
        const container = document.getElementById('chatMessages');
        const isOwn = message.sender_id === this.user.id;
        
        let fileContent = '';
        if (message.message_type === 'image' && message.file_path) {
            fileContent = `<div class="message-file"><img src="/uploads/${message.file_path}" alt="Image" style="max-width: 200px;"></div>`;
        } else if (message.message_type === 'file' && message.file_path) {
            fileContent = `<div class="message-file"><a href="/uploads/${message.file_path}" target="_blank">📎 ${message.file_path}</a></div>`;
        }

        const messageElement = document.createElement('div');
        messageElement.className = `message ${isOwn ? 'sent' : 'received'}`;
        messageElement.innerHTML = `
            <div class="message-info">${message.sender_name} • ${new Date(message.timestamp).toLocaleTimeString()}</div>
            ${message.message ? `<div>${message.message}</div>` : ''}
            ${fileContent}
        `;
        
        container.appendChild(messageElement);
        container.scrollTop = container.scrollHeight;
    }

    async sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const fileInput = document.getElementById('chatFile');
        const message = messageInput.value.trim();
        
        if (!message && !fileInput.files[0]) return;

        const formData = new FormData();
        formData.append('message', message);
        formData.append('receiver_id', this.currentChatReceiverId);
        
        if (fileInput.files[0]) {
            formData.append('file', fileInput.files[0]);
        }

        try {
            await this.apiCall(`/api/chat/${this.currentChatRequestId}`, {
                method: 'POST',
                body: formData
            });
            
            messageInput.value = '';
            fileInput.value = '';
        } catch (error) {
            this.showAlert('Failed to send message', 'error');
        }
    }

    handleFileUpload(e) {
        const file = e.target.files[0];
        if (file) {
            this.sendMessage();
        }
    }

    openRating(requestId) {
        this.currentRatingRequestId = requestId;
        this.selectedRating = 0;
        
        document.getElementById('ratingModal').style.display = 'block';
        document.getElementById('reviewText').value = '';
        
        // Reset stars
        document.querySelectorAll('.star').forEach(star => {
            star.classList.remove('active');
        });
    }

    selectRating(rating) {
        this.selectedRating = rating;
        
        document.querySelectorAll('.star').forEach((star, index) => {
            if (index < rating) {
                star.classList.add('active');
            } else {
                star.classList.remove('active');
            }
        });
    }

    async submitRating() {
        if (this.selectedRating === 0) {
            this.showAlert('Please select a rating', 'error');
            return;
        }

        const review = document.getElementById('reviewText').value;

        try {
            await this.apiCall(`/api/requests/${this.currentRatingRequestId}/rate`, {
                method: 'POST',
                body: {
                    rating: this.selectedRating,
                    review: review
                }
            });

            document.getElementById('ratingModal').style.display = 'none';
            this.loadRequests();
            this.showAlert('Rating submitted successfully!', 'success');
        } catch (error) {
            this.showAlert(error.message, 'error');
        }
    }

    showAlert(message, type) {
        // Remove existing alerts
        const existingAlerts = document.querySelectorAll('.alert');
        existingAlerts.forEach(alert => alert.remove());

        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.textContent = message;
        
        document.querySelector('.container').insertBefore(alert, document.querySelector('.container').firstChild);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            alert.remove();
        }, 5000);
    }
}

// Initialize the app
const app = new NotesApp();