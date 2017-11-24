'use babel';

import NpmRunnerView from './npm-runner-view';
import { CompositeDisposable, Disposable } from 'atom';
import package from '../package.json'

export default {

  npmRunnerView: null,
  subscriptions: null,

  activate(state) {
    this.subscribeActions(state)
  },
  
  subscribeActions(state) {
    this.subscriptions = new CompositeDisposable(
      atom.workspace.addOpener(uri => {
        if (uri === package.uri) {
          this.npmRunnerView = new NpmRunnerView()

          return this.npmRunnerView
        }
      }),

      // Register command that toggles this view
      atom.commands.add('atom-workspace', {
        'npm-runner:toggle': () => this.toggle()
      }),

      // Register command that toggles this view
      atom.commands.add('atom-workspace', {
        'npm-runner:update-tasks': () => this.updateTasks()
      }),

      new Disposable(() => {
        atom.workspace.getPaneItems().forEach(item => {
          if (item instanceof NpmRunnerView) {
            item.destroy()
          }
        })
      })
    )
  },

  deactivate() {
    this.subscriptions.dispose();
  },

  toggle() {
    atom.workspace.toggle(package.uri)
  },

  updateTasks() {
    if (this.npmRunnerView) {
      this.npmRunnerView.render()
    }
  },

  deserializeNpmRunnerView(serialized) {
    this.subscribeActions(serialized)
    this.npmRunnerView = new NpmRunnerView()

    return this.npmRunnerView
  }

};
