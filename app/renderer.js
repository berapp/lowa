// Renderer process script
document.addEventListener('DOMContentLoaded', () => {
  // Display version information
  document.getElementById('node-version').textContent = process.versions.node;
  document.getElementById('chrome-version').textContent = process.versions.chrome;
  document.getElementById('electron-version').textContent = process.versions.electron;

  // Handle button click
  const startBtn = document.getElementById('start-btn');
  const statusDiv = document.getElementById('status');

  startBtn.addEventListener('click', () => {
    statusDiv.style.display = 'block';
    startBtn.textContent = 'Analysis Running...';
    
    // Simulate some activity
    setTimeout(() => {
      startBtn.textContent = 'Start Analysis';
      statusDiv.textContent = 'Analysis completed successfully!';
    }, 2000);
  });
});
