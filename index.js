'use strict'

const getCommit = require('git-current-commit').promise
const getRepo = require('gh-canonical-repository').promise
const getBuild = require('appveyor-build-by-commit')
const retry = require('p-retry')
const EventEmitter = require('events')
const got = require('got')

module.exports = dir => {
  const events = new EventEmitter()

  let repo, sha

  Promise.all([getRepo(dir), retry(() => getCommit(dir), { retries: 10 })])
    .then(([_repo, _sha]) => {
      [repo, sha] = [_repo, _sha]
      events.emit('repo')
    })
    .then(() => getBuild({ repo, sha }))
    .then(build => {
      events.emit('build')
      const start = Promise.resolve(true)
      let next = start
      for (let job of build.jobs) {
        next = next.then(
          () => new Promise((resolve, reject) => {
            const s = got.stream(`https://ci.appveyor.com/api/buildjobs/${job.jobId}/log`)
            s.on('end', resolve)
            s.on('error', err => reject(err))
            events.emit('job', s)
          })
        )
      }
      next
        .then(() => getBuild({ repo, sha }))
        .then(build => {
          if (build.status === 'success') {
            events.emit('pass')
          } else {
            events.emit('fail')
          }
        })
      return start
    })
    .catch(err => {
      events.emit('error', err)
    })

  return events
}
