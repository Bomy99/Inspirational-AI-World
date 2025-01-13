let coins = parseInt(localStorage.getItem('coins')) || 0;

function updateButtonStates() {
    document.querySelectorAll('.generate-button').forEach(button => {
        if (coins <= 0) {
            button.disabled = true;
            button.style.opacity = '0.5';
            button.style.cursor = 'not-allowed';
        } else {
            button.disabled = false;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
        }
    });
}

function updateCoinsDisplay() {
    document.querySelector('.coin-count').textContent = coins;
    updateButtonStates();
}

function showPaymentModal() {
    document.getElementById('payment-modal').style.display = 'block';
}

document.querySelector('.modal-close').addEventListener('click', () => {
    document.getElementById('payment-modal').style.display = 'none';
});

// Add initialization check
async function checkInitialCoins() {
    if (!localStorage.getItem('coinsInitialized')) {
        try {
            const response = await fetch('/api/initialize-coins', {
                method: 'POST'
            });
            const data = await response.json();
            if (data.coins > 0) {
                coins = data.coins;
                localStorage.setItem('coins', coins);
                updateCoinsDisplay();
            }
            localStorage.setItem('coinsInitialized', 'true');
        } catch (error) {
            console.error('Error initializing coins:', error);
        }
    }
}

function loadSavedState() {
    document.querySelectorAll('.inspiration-column').forEach((column, index) => {
        const savedState = JSON.parse(localStorage.getItem(`column_${index}`));
        if (savedState) {
            const quoteDisplay = column.querySelector('.quote-display');
            const imageDisplay = column.querySelector('.image-display');
            const downloadButton = column.querySelector('.download-button');

            quoteDisplay.textContent = savedState.quote;
            quoteDisplay.classList.add('visible');
            
            imageDisplay.src = savedState.imagePath;
            imageDisplay.style.display = 'block';
            imageDisplay.classList.add('visible');
            downloadButton.classList.add('visible');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadSavedState();
    checkInitialCoins();
    const columns = document.querySelectorAll('.inspiration-column');
    const types = ['nature', 'cat', 'surprise'];

    columns.forEach((column, index) => {
        const generateButton = column.querySelector('.generate-button');
        const quoteDisplay = column.querySelector('.quote-display');
        const imageDisplay = column.querySelector('.image-display');
        const loadingSpinner = column.querySelector('.loading-spinner');
        const downloadButton = column.querySelector('.download-button');
        
        // Add cooldown status element
        const cooldownStatus = document.createElement('div');
        cooldownStatus.className = 'cooldown-status';
        cooldownStatus.style.display = 'none';
        column.insertBefore(cooldownStatus, loadingSpinner);

        // Load saved state for this column
        const savedState = JSON.parse(localStorage.getItem(`column_${index}`));
        if (savedState) {
            quoteDisplay.textContent = savedState.quote;
            quoteDisplay.classList.add('visible');
            imageDisplay.src = savedState.imagePath;
            imageDisplay.style.display = 'block';
            imageDisplay.classList.add('visible');
            downloadButton.classList.add('visible');
        }

        // Add cooldown functionality
        function startCooldown() {
            let timeLeft = 10;
            generateButton.disabled = true;
            cooldownStatus.style.display = 'block';
            
            const cooldownInterval = setInterval(() => {
                cooldownStatus.textContent = `Please wait ${timeLeft} seconds before generating again`;
                timeLeft--;
                
                if (timeLeft < 0) {
                    clearInterval(cooldownInterval);
                    generateButton.disabled = false;
                    cooldownStatus.style.display = 'none';
                }
            }, 1000);
        }

        // Add download button click handler
        downloadButton.addEventListener('click', async () => {
            try {
                const response = await fetch(imageDisplay.src);
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = imageDisplay.src.split('/').pop();
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } catch (error) {
                console.error('Error downloading image:', error);
                alert('Error downloading image. Please try again.');
            }
        });

        generateButton.addEventListener('click', async () => {
            if (coins <= 0) {
                showPaymentModal();
                return;
            }

            console.log(`Generate button clicked in column ${index + 1}`);
            try {
                // Deduct coin
                coins--;
                localStorage.setItem('coins', coins);
                updateCoinsDisplay();

                // Show loading state
                loadingSpinner.style.display = 'block';
                generateButton.disabled = true;
                cooldownStatus.style.display = 'none';

                // Save current image URL if it exists
                const currentImagePath = imageDisplay.src;

                console.log('Sending request to backend...');
                const response = await fetch('/api/generate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        type: types[index],
                        previousImage: currentImagePath
                    })
                }).catch(error => {
                    console.error('Fetch error:', error);
                    throw new Error('Network error - please check if the server is running');
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                console.log('Data received:', data);

                if (data.quote && data.imagePath) {
                    // Save the new state to localStorage
                    localStorage.setItem(`column_${index}`, JSON.stringify({
                        quote: data.quote,
                        imagePath: data.imagePath
                    }));

                    quoteDisplay.textContent = data.quote;
                    quoteDisplay.classList.add('visible');
                    
                    const newImage = new Image();
                    newImage.onload = () => {
                        imageDisplay.src = data.imagePath;
                        imageDisplay.style.display = 'block';
                        imageDisplay.classList.add('visible');
                        downloadButton.classList.add('visible');
                        startCooldown();
                    };
                    newImage.onerror = () => {
                        console.error('Failed to load image:', data.imagePath);
                        quoteDisplay.textContent = 'Error loading image. Please try again.';
                    };
                    newImage.src = data.imagePath;
                }

            } catch (error) {
                console.error('Error:', error);
                quoteDisplay.textContent = 'Error generating content. Please try again.';
                quoteDisplay.classList.add('visible');
                downloadButton.classList.remove('visible');
            } finally {
                loadingSpinner.style.display = 'none';
            }
        });

        // Update image loading error handling
        imageDisplay.onerror = function() {
            console.error('Failed to load image:', this.src);
            this.style.display = 'none';
            quoteDisplay.textContent = 'Error loading image. Please try again.';
        };
    });

    updateButtonStates();

    async function updateStats() {
        try {
            const response = await fetch('/api/stats');
            const data = await response.json();
            document.getElementById('visitorCount').textContent = data.uniqueVisitors;
            document.getElementById('generationCount').textContent = data.totalGenerations;
            
            // Save to localStorage as backup
            localStorage.setItem('totalGenerations', data.totalGenerations);
            localStorage.setItem('uniqueVisitors', data.uniqueVisitors);
        } catch (error) {
            // If server fetch fails, use localStorage data
            const savedGenerations = localStorage.getItem('totalGenerations') || '-';
            const savedVisitors = localStorage.getItem('uniqueVisitors') || '-';
            document.getElementById('generationCount').textContent = savedGenerations;
            document.getElementById('visitorCount').textContent = savedVisitors;
            console.error('Error fetching stats:', error);
        }
    }

    // Update stats every 30 seconds instead of every minute
    setInterval(updateStats, 30000);
    updateStats(); // Initial update
});

// Add payment success handler (you'll need to implement the webhook on your backend)
window.addEventListener('message', function(e) {
    if (e.data.type === 'payment-success') {
        const amount = e.data.amount;
        let newCoins = 0;
        
        switch(amount) {
            case 1:
                newCoins = 4;
                break;
            case 3:
                newCoins = 15;
                break;
            case 5:
                newCoins = 30;
                break;
        }
        
        coins += newCoins;
        localStorage.setItem('coins', coins);
        updateCoinsDisplay();
    }
});

function startPaymentCheck(email) {
    const checkInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/check-payment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });
            
            const data = await response.json();
            if (data.success) {
                clearInterval(checkInterval);
                coins += data.coins;
                localStorage.setItem('coins', coins);
                updateCoinsDisplay();
                alert(`Payment successful! Added ${data.coins} coins to your balance.`);
            }
        } catch (error) {
            console.error('Payment check error:', error);
        }
    }, 5000); // Check every 5 seconds

    // Stop checking after 5 minutes
    setTimeout(() => {
        clearInterval(checkInterval);
    }, 300000);
}

function handlePaymentClick(amount) {
    const email = prompt('Please enter your email to track your payment:');
    if (email) {
        // Store email in localStorage for payment checking
        localStorage.setItem('pendingPaymentEmail', email);
        startPaymentCheck(email);
        // Redirect to Buy Me a Coffee
        window.open(`https://buymeacoffee.com/itiswhatitisai`, '_blank');
    }
}
