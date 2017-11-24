'use babel';

import package from '../package.json'
import {BufferedProcess} from 'atom'
import fs from 'fs'

function syncExists(path) {
  try {
    fs.statSync(path)
  } catch(e) {
    if (e.code === 'ENOENT') {
      return false
    }
  }

  return true
}

export default class NpmRunnerView {

  constructor(serializedState) {
    // Create root element
    this.element = document.createElement('div');
    this.element.classList.add('npm-runner');

    this.taskButtons = []
    this.projectPaths = []
    this.lastTask = {}

    this.prepareLastTasks()

    this.bindedTaskButtonClickHandler = this.taskButtonClickHandler.bind(this)
    this.bindedExitHandler = this.exitHandler.bind(this)

    this.subscriptions = atom.workspace.getCenter().observeActivePaneItem(item => {
      const projectPaths = atom.project.getPaths()
      if (this.detectChangePaths(this.projectPaths, projectPaths)) {
        this.projectPaths = projectPaths

        this.prepareLastTasks()

        this.render()
      }
    })

    atom.project.onDidChangePaths(projectPaths => {
      if (this.detectChangePaths(this.projectPaths, projectPaths)) {
        this.projectPaths = projectPaths

        this.prepareLastTasks()

        this.render()
      }
    })
  }

  detectChangePaths(arr1, arr2) {
    for (const item in arr1) {
      if (!~arr2.indexOf(arr1[item])) {
        return true
      }
    }

    for (const item in arr2) {
      if (!~arr1.indexOf(arr2[item])) {
        return true
      }
    }

    return false
  }

  prepareLastTasks() {
    this.projectPaths.forEach(path => {
      if (!this.lastTask[path]) {
        this.lastTask[path] = {
          process: false,
          name: false
        }
      }
    })
  }

  render() {
    this.removeButtonEventListeners()
    this.taskButtons.splice(0, this.taskButtons.length)

    while (this.element.childNodes.length) {
      this.element.removeChild(this.element.childNodes[0])
    }

    this.projectPaths.forEach(path => {
      const padded = document.createElement('div')
      padded.className = 'padded'

      if (this.projectPaths.length > 1) {
        const pathDesc = document.createElement('p')
        pathDesc.appendChild(document.createTextNode(`${path}:`))
        padded.appendChild(pathDesc)
      }

      const group = document.createElement('div')
      group.className = 'btn-group'

      this.renderGroup(path, group)

      padded.appendChild(group)
      this.element.appendChild(padded)
    })
  }

  packageJsonExists(path) {
    return syncExists(`${path}/package.json`)
  }

  renderGroup(path, group) {
    if (!this.packageJsonExists(path)) {
      this.renderMessage(group, 'package.json not found')
    } else {
      Promise.resolve()
      .then(this.getTaskList(path))
      .catch(error => {
        if (error.code === 127) {
          return asyncTimeout(null, 3000)
        }

        return Promise.reject(error)
      })
      .then(this.getTaskList(path))
      .then(this.renderButtons(path, group))
      .catch(error => {
        atom.notifications.addError(error.message, {dismissable: true})
        this.renderMessage(group, 'Something went wrong')
      })
    }
  }

  renderButtons(cwd, group) {
    return (tasks) => tasks.forEach(task => {
      const taskButton = document.createElement('button')
      taskButton.className = `btn${task === this.lastTask[cwd].name ? ' selected' : ''}`
      taskButton.setAttribute('data-task', task)
      taskButton.setAttribute('data-cwd', cwd)
      taskButton.appendChild(document.createTextNode(this.prepareTaskLabel(task)))

      group.appendChild(taskButton)

      this.taskButtons.push(taskButton)

      taskButton.addEventListener('click', this.bindedTaskButtonClickHandler)
    })
  }

  renderMessage(group, message) {
    const messageBlock = document.createElement('p')
    messageBlock.appendChild(document.createTextNode(message))

    group.appendChild(messageBlock)
  }

  removeButtonEventListeners() {
    this.taskButtons.forEach(button => {
      button.removeEventListener('click', this.bindedTaskButtonClickHandler)
    })
  }

  prepareTaskLabel(task) {
    return task.split(/[\-_]/)
    .map(word => word.substr(0, 1).toUpperCase() + word.substr(1))
    .join(' ')
  }
  
  prepareTaskList(output) {
    if (!output.scripts) return []

    const tasks = []

    for (let key in output.scripts) {
      tasks.push(key)
    }

    return tasks
  }

  getTaskList(cwd) {
    return () => new Promise((resolve, reject) => {
      fs.readFile(path.resolve(cwd, 'package.json'), (err, data) => {
        if (!err) {
          const output = JSON.parse(data)

          resolve(this.prepareTaskList(output))
        }
      })
    })
  }

  exitHandler(cwd) {
    return (code = -1) => {
      const lastTaskName = this.lastTask[cwd].name
      this.lastTask[cwd].process = false

      if (lastTaskName !== false) {
        this.element.querySelector(`[data-task="${lastTaskName}"][data-cwd="${cwd}"]`)
        .classList.remove('selected')

        if (code === 0) {
          atom.notifications.addSuccess(`Npm task \`${lastTaskName}\` is finished`)
        } else if (code > 0) {
          atom.notifications.addError(`Npm task is \`${lastTaskName}\` failed`)
        }

        this.lastTask[cwd].name = false
      }
    }
  }

  taskButtonClickHandler(e) {
    const taskButton = e.target
    const taskName = taskButton.getAttribute('data-task')
    const cwd = taskButton.getAttribute('data-cwd')
    const lastTaskName = this.lastTask[cwd].name
    const runSameTask = lastTaskName === taskName

    if (lastTaskName !== false) {
      atom.notifications.addWarning(`Npm task \`${lastTaskName}\` is stopped`)
      this.lastTask[cwd].process.kill()
      this.exitHandler(cwd)()

      if (runSameTask) {
        return
      }
    }

    taskButton.classList.add('selected')

    this.lastTask[cwd].name = taskName
    this.lastTask[cwd].process = new BufferedProcess({
      command: 'npm',
      args: ['run', taskName],
      exit: this.exitHandler(cwd),
      options: {cwd}
    })
  }

  // Returns an object that can be retrieved when package is activated
  serialize() {
    return {
      // This is used to look up the deserializer function. It can be any string, but it needs to be
      // unique across all packages!
      deserializer: 'npm-runner/NpmRunnerView'
    }
  }

  // Tear down any state and detach
  destroy() {
    for (const cwd in this.lastTask) {
      if (this.lastTask[cwd].process !== false) {
        this.lastTask[cwd].process.kill()
      }
    }

    this.removeButtonEventListeners()
    this.element.remove()
    this.subscriptions.dispose()
  }

  getElement() {
    return this.element
  }

  getTitle() {
    return 'Npm runner'
  }
  
  getURI() {
    return package.uri
  }

  getDefaultLocation() {
    // This location will be used if the user hasn't overridden it by dragging the item elsewhere.
    // Valid values are "left", "right", "bottom", and "center" (the default).
    return 'bottom'
  }

  getAllowedLocations() {
    // The locations into which the item can be moved.
    return ['bottom']
  }

}
