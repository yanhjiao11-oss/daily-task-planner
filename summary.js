(() => {
  'use strict'

  const STORAGE = {
    state: 'daily-planner-state-v1',
    credentials: 'daily-planner-credentials-v1',
    cache: 'daily-planner-cloud-cache-v1',
    pending: 'daily-planner-sync-pending-v1',
  }
  const state = { data: { tasks: [], pomodoroLog: [], settings: {} }, token: '', gistId: '', filter: 'all', syncTimer: null }
  const $ = (selector) => document.querySelector(selector)
  const $$ = (selector) => [...document.querySelectorAll(selector)]
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]))
  const statusLabel = (status) => ({ todo: '待办', doing: '进行中', waiting: '待客户回复', done: '已完成' }[status] || '待办')
  const formatDateTime = (value) => value ? new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

  function normalizeTask(task) {
    const tags = Array.isArray(task.tags) ? [...new Set(task.tags.filter((tag) => ['test', 'optimization'].includes(tag)))] : []
    const review = task.review && typeof task.review === 'object'
      ? { clientName: task.review.clientName || '', action: task.review.action || '', result: task.review.result || '', updatedAt: task.review.updatedAt || '' }
      : { clientName: '', action: '', result: '', updatedAt: '' }
    return { ...task, tags, review }
  }

  function loadLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE.state) || '{}')
      const cached = JSON.parse(localStorage.getItem(STORAGE.cache) || 'null')
      const source = Array.isArray(saved.tasks) ? saved : (cached || {})
      state.data = { tasks: Array.isArray(source.tasks) ? source.tasks.map(normalizeTask) : [], pomodoroLog: Array.isArray(source.pomodoroLog) ? source.pomodoroLog : [], settings: source.settings || saved.settings || {} }
      const credentials = JSON.parse(localStorage.getItem(STORAGE.credentials) || '{}')
      state.token = credentials.token || ''
      state.gistId = credentials.gistId || ''
    } catch (_) {
      showToast('本地复盘数据读取失败。', 'error')
    }
  }

  function taggedTasks() {
    return state.data.tasks
      .filter((task) => task.tags?.some((tag) => tag === 'test' || tag === 'optimization'))
      .filter((task) => state.filter === 'all' || task.tags.includes(state.filter))
      .sort((a, b) => new Date(b.review?.updatedAt || b.createdAt || 0) - new Date(a.review?.updatedAt || a.createdAt || 0))
  }

  function tagPills(task) {
    return task.tags.map((tag) => tag === 'test'
      ? '<span class="review-tag-pill test">🧪 测试</span>'
      : '<span class="review-tag-pill optimization">◆ 关键优化</span>').join('')
  }

  function reviewCard(task) {
    const review = task.review || {}
    const action = review.action || task.title
    return `<form class="review-card" data-task-id="${escapeHtml(task.id)}">
      <div class="review-card-header">
        <div><h3 class="review-card-title">${escapeHtml(task.title)}</h3><div class="review-card-tags">${tagPills(task)}</div></div>
        <span class="source-status">${statusLabel(task.status)}</span>
      </div>
      <div class="review-fields">
        <label class="field"><span>客户名称</span><input name="clientName" maxlength="160" value="${escapeHtml(review.clientName || '')}" placeholder="例如：A 客户" /></label>
        <label class="field"><span>测试或优化动作</span><textarea name="action" rows="2" maxlength="2000" placeholder="记录具体做了什么">${escapeHtml(action)}</textarea></label>
        <label class="field result-field"><span>结果描述</span><textarea name="result" rows="4" maxlength="5000" placeholder="记录验证结果、数据变化、客户反馈或后续结论">${escapeHtml(review.result || '')}</textarea></label>
      </div>
      <div class="review-footer">
        <span class="review-meta">任务创建于 ${formatDateTime(task.createdAt)}${review.updatedAt ? ` · 复盘更新于 ${formatDateTime(review.updatedAt)}` : ''}</span>
        <div class="review-save-area"><span class="save-state">${review.updatedAt ? '已保存' : '尚未保存复盘'}</span><button class="primary-button" type="submit">保存记录</button></div>
      </div>
    </form>`
  }

  function render() {
    const allTagged = state.data.tasks.filter((task) => task.tags?.length)
    $('#reviewTotal').textContent = allTagged.length
    $('#testTotal').textContent = allTagged.filter((task) => task.tags.includes('test')).length
    $('#optimizationTotal').textContent = allTagged.filter((task) => task.tags.includes('optimization')).length
    $('#resultTotal').textContent = allTagged.filter((task) => task.review?.result?.trim()).length
    const tasks = taggedTasks()
    $('#reviewList').innerHTML = tasks.length
      ? tasks.map(reviewCard).join('')
      : `<div class="review-empty"><strong>${state.filter === 'all' ? '还没有长期复盘事项' : '这个标签下暂无事项'}</strong><p>在任务的新建或编辑窗口中勾选“测试”或“关键优化”，事项就会自动出现在这里。</p><a href="index.html">返回任务页添加标签</a></div>`
  }

  function saveLocal() {
    localStorage.setItem(STORAGE.state, JSON.stringify(state.data))
    localStorage.setItem(STORAGE.cache, JSON.stringify({ tasks: state.data.tasks, pomodoroLog: state.data.pomodoroLog, savedAt: new Date().toISOString() }))
  }

  function handleReviewSave(event) {
    const form = event.target.closest('.review-card')
    if (!form) return
    event.preventDefault()
    const task = state.data.tasks.find((item) => item.id === form.dataset.taskId)
    if (!task) return
    const values = new FormData(form)
    task.review = {
      clientName: String(values.get('clientName') || '').trim(),
      action: String(values.get('action') || '').trim(),
      result: String(values.get('result') || '').trim(),
      updatedAt: new Date().toISOString(),
    }
    saveLocal()
    const saveState = form.querySelector('.save-state')
    saveState.textContent = `已保存 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
    saveState.classList.add('saved')
    $('#resultTotal').textContent = state.data.tasks.filter((item) => item.tags?.length && item.review?.result?.trim()).length
    scheduleSync()
    showToast('复盘记录已保存', 'success')
  }

  function setSyncStatus(status, message = '') {
    const el = $('#syncStatus')
    el.className = `sync-status ${status}`
    const labels = { local: '仅本地保存', pending: '等待同步', syncing: '正在同步…', synced: message || '已同步', offline: '离线 / 未同步', error: message || '同步失败' }
    el.querySelector('.sync-label').textContent = labels[status] || status
  }

  function headers() {
    return { Authorization: `Bearer ${state.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' }
  }

  async function errorMessage(response) {
    const known = { 401: 'Token 无效或已过期', 403: 'Token 没有 gist 权限或请求受限', 404: '找不到 Gist' }
    return known[response.status] || `GitHub 同步失败（${response.status}）`
  }

  async function syncFromCloud({ quiet = false } = {}) {
    if (!state.token || !state.gistId) { setSyncStatus('local'); if (!quiet) showToast('请先回到任务页设置 GitHub Token 和 Gist ID。', 'warning'); return }
    setSyncStatus('syncing')
    try {
      const response = await fetch(`https://api.github.com/gists/${encodeURIComponent(state.gistId)}`, { headers: headers() })
      if (!response.ok) throw new Error(await errorMessage(response))
      const gist = await response.json()
      const tasksContent = gist.files?.['tasks.json']?.content
      const logsContent = gist.files?.['pomodoro-log.json']?.content
      if (tasksContent) state.data.tasks = JSON.parse(tasksContent).map(normalizeTask)
      if (logsContent) state.data.pomodoroLog = JSON.parse(logsContent)
      localStorage.removeItem(STORAGE.pending)
      saveLocal(); render()
      setSyncStatus('synced', `已同步 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`)
      if (!quiet) showToast('已读取云端复盘数据', 'success')
    } catch (error) {
      setSyncStatus(navigator.onLine ? 'error' : 'offline', error.message)
      if (!quiet) showToast(`${error.message}，继续使用本地数据。`, 'error')
    }
  }

  function scheduleSync() {
    if (!state.token || !state.gistId) { setSyncStatus('local'); return }
    localStorage.setItem(STORAGE.pending, new Date().toISOString())
    setSyncStatus('pending')
    clearTimeout(state.syncTimer)
    state.syncTimer = setTimeout(syncToCloud, 900)
  }

  async function syncToCloud() {
    setSyncStatus('syncing')
    try {
      const files = { 'tasks.json': { content: JSON.stringify(state.data.tasks, null, 2) }, 'pomodoro-log.json': { content: JSON.stringify(state.data.pomodoroLog, null, 2) } }
      const response = await fetch(`https://api.github.com/gists/${encodeURIComponent(state.gistId)}`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ files }) })
      if (!response.ok) throw new Error(await errorMessage(response))
      localStorage.removeItem(STORAGE.pending)
      setSyncStatus('synced', `已同步 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`)
    } catch (error) {
      setSyncStatus(navigator.onLine ? 'error' : 'offline', error.message)
      showToast(`${error.message}，修改已保存在本地。`, 'error')
    }
  }

  function showToast(message, type = '') {
    const toast = document.createElement('div')
    toast.className = `toast ${type}`.trim()
    toast.textContent = message
    $('#toastRegion').appendChild(toast)
    setTimeout(() => toast.remove(), 3500)
  }

  function bindEvents() {
    $('#reviewList').addEventListener('submit', handleReviewSave)
    $('#syncButton').addEventListener('click', () => syncFromCloud())
    $$('[data-review-filter]').forEach((button) => button.addEventListener('click', () => {
      state.filter = button.dataset.reviewFilter
      $$('[data-review-filter]').forEach((item) => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-selected', String(active)) })
      render()
    }))
    window.addEventListener('online', () => { if (state.token && state.gistId) syncToCloud() })
    window.addEventListener('offline', () => setSyncStatus('offline'))
  }

  loadLocal(); bindEvents(); render()
  if (state.token && state.gistId && navigator.onLine) { if (localStorage.getItem(STORAGE.pending)) syncToCloud(); else syncFromCloud({ quiet: true }) }
})()
