import './search.js'
import { applyDefaults } from './defaults.js'

// GitHub API URL for fetching the latest release
const githubApiUrl = 'https://api.github.com/repos/hyphacoop/reader.distributed.press/releases/latest'

async function fetchReleaseVersion () {
  try {
    const response = await fetch(githubApiUrl)
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`)
    }
    const releaseData = await response.json()
    return releaseData.tag_name
  } catch (error) {
    console.error('Error fetching release version:', error)
    return 'Unknown Version'
  }
}

const response = await fetch('./sidebar.html')
const text = await response.text()
const template = document.createElement('template')
template.innerHTML = text

const style = document.createElement('style')
style.textContent = '@import url("./sidebar.css");'
document.head.appendChild(style)

class SidebarNav extends HTMLElement {
  constructor () {
    super()
    this.init()
  }

  async connectedCallback () {
    await applyDefaults()

    // Fetch the latest release version and display it in the sidebar
    const versionElement = this.querySelector('#release-version')
    if (versionElement) {
      const releaseVersion = await fetchReleaseVersion()
      versionElement.textContent = `${releaseVersion}`
    }
  }

  init () {
    const instance = template.content.cloneNode(true)
    this.appendChild(instance)
  }
}

customElements.define('sidebar-nav', SidebarNav)
