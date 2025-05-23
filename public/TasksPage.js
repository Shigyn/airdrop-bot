const TasksPage = {
  showTasksPage: async function() {
    try {
      const response = await fetch('/api/tasks', {
        headers: {
          'Telegram-Data': window.Telegram.WebApp.initData || ''
        }
      });
      
      const tasks = await response.json();
      
      const content = document.getElementById('content');
      content.innerHTML = `
        <div class="tasks-container">
          <h3>Complete Tasks</h3>
          ${tasks.map(task => `
            <div class="task-item">
              <img src="${task.icon}" alt="${task.name}">
              <span>${task.name}</span>
              <button class="task-button" data-id="${task.id}">
                +${task.reward} tokens
              </button>
            </div>
          `).join('')}
        </div>
      `;
      
      // Réattacher les événements
      document.querySelectorAll('.task-button').forEach(btn => {
        btn.addEventListener('click', this.handleTaskComplete);
      });
    } catch (error) {
      console.error('Tasks error:', error);
      document.getElementById('content').innerHTML = `
        <div class="error-message">
          Failed to load tasks. Please try again later.
        </div>
      `;
    }
  },

  handleTaskComplete: async function(e) {
    const taskId = e.target.getAttribute('data-id');
    try {
      const response = await fetch('/api/complete-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Telegram-Data': window.Telegram.WebApp.initData || ''
        },
        body: JSON.stringify({ taskId })
      });
      
      const result = await response.json();
      if (result.success) {
        window.Telegram.WebApp.showAlert(`Task completed! ${result.reward} tokens earned.`);
        this.showTasksPage();
      }
    } catch (error) {
      console.error('Task completion error:', error);
    }
  }
};