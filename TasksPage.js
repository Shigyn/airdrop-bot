// Fonction pour afficher les tâches
async function showTasksPage() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="tasks-container">
      <h2>📋 Available Tasks</h2>
      <div id="tasks-list" class="tasks-list">
        <div class="loading-spinner"></div>
      </div>
    </div>
  `;

  try {
    const tasks = await fetchTasks();
    renderTasks(tasks);
  } catch (error) {
    document.getElementById('tasks-list').innerHTML = `
      <div class="error-message">
        Failed to load tasks. Try again later.
      </div>
    `;
  }
}

// Fetch les tâches depuis le backend
async function fetchTasks() {
  const response = await fetch('/tasks');
  if (!response.ok) throw new Error('API error');
  return await response.json();
}

// Afficher la liste des tâches
function renderTasks(tasks) {
  const container = document.getElementById('tasks-list');
  if (!tasks.length) {
    container.innerHTML = `<p class="no-tasks">No tasks available yet!</p>`;
    return;
  }

  container.innerHTML = tasks
    .map(task => `
      <div class="task-card ${task.completed ? 'completed' : ''}">
        <h3>${task.description}</h3>
        <p>Reward: <strong>${task.reward} tokens</strong></p>
        <button 
          class="task-button" 
          ${task.completed ? 'disabled' : ''}
          data-task-id="${task.id}"
        >
          ${task.completed ? '✅ Completed' : 'Claim Task'}
        </button>
      </div>
    `)
    .join('');
}

// Exporter pour utilisation dans app.js
window.TasksPage = { showTasksPage };