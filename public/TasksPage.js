const TasksPage = {
  showTasksPage: async function() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="tasks-container">
        <h2>📋 Tasks</h2>
        <div id="tasks-list">Loading...</div>
      </div>
    `;
    
    try {
      const response = await fetch('/tasks');
      if (!response.ok) throw new Error('API error');
      const tasks = await response.json();
      
      document.getElementById('tasks-list').innerHTML = tasks.map(task => `
        <div class="task-card ${task.completed ? 'completed' : ''}">
          <h3>${task.description}</h3>
          <p>Reward: ${task.reward} tokens</p>
          <button 
            class="task-button" 
            ${task.completed ? 'disabled' : ''}
            data-task-id="${task.id}"
          >
            ${task.completed ? '✅ Completed' : 'Claim Task'}
          </button>
        </div>
      `).join('');
    } catch (error) {
      document.getElementById('tasks-list').innerHTML = `
        <div class="error-message">
          Failed to load tasks. Try again later.
        </div>
      `;
      console.error("Tasks error:", error);
    }
  }
};

window.TasksPage = TasksPage;