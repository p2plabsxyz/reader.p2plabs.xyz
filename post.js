/* global customElements, HTMLElement */
import DOMPurify from './dependencies/dompurify/purify.js'
import { db } from './dbInstance.js'
import { applyDefaults } from './defaults.js'
import './p2p-media.js'
import './post-replies.js'

function formatDate (dateString) {
  const options = { year: 'numeric', month: 'short', day: 'numeric' }
  return new Date(dateString).toLocaleDateString(undefined, options)
}

// Helper function to calculate elapsed time (e.g., 1h, 1d, 1w)
function timeSince (dateString) {
  const date = new Date(dateString)
  const seconds = Math.floor((new Date() - date) / 1000)

  let interval = seconds / 31536000 // 365 * 24 * 60 * 60
  if (interval > 1) {
    return formatDate(dateString) // Return formatted date if more than a year
  }
  interval = seconds / 2592000 // 30 * 24 * 60 * 60
  if (interval > 1) {
    return Math.floor(interval) + 'mo'
  }
  interval = seconds / 604800 // 7 * 24 * 60 * 60
  if (interval > 1) {
    return Math.floor(interval) + 'w'
  }
  interval = seconds / 86400 // 24 * 60 * 60
  if (interval > 1) {
    return Math.floor(interval) + 'd'
  }
  interval = seconds / 3600 // 60 * 60
  if (interval > 1) {
    return Math.floor(interval) + 'h'
  }
  interval = seconds / 60
  if (interval > 1) {
    return Math.floor(interval) + 'm'
  }
  return Math.floor(seconds) + 's'
}

function insertImagesAndVideos (content) {
  const parser = new DOMParser()
  const contentDOM = parser.parseFromString(content, 'text/html')

  contentDOM.querySelectorAll('img').forEach(img => {
    const originalSrc = img.getAttribute('src')
    const p2pImg = document.createElement('p2p-image')
    p2pImg.setAttribute('src', originalSrc)

    // Append the image directly to the parent node
    img.parentNode.replaceChild(p2pImg, img)
  })

  contentDOM.querySelectorAll('video').forEach(video => {
    const originalSrc = video.getAttribute('src')
    const p2pVideo = document.createElement('p2p-video')
    p2pVideo.setAttribute('src', originalSrc)

    // Append the video directly to the parent node
    video.parentNode.replaceChild(p2pVideo, video)
  })

  // Return the modified content as a string
  return contentDOM.body.innerHTML
}

// Define a class for the <distributed-post> web component
class DistributedPost extends HTMLElement {
  static get observedAttributes () {
    return ['url']
  }

  async connectedCallback () {
    await applyDefaults()

    this.loadAndRenderPost(this.getAttribute('url'))
  }

  async loadAndRenderPost (postUrl) {
    if (!postUrl) {
      this.renderErrorContent('No post URL provided')
      return
    }

    try {
      const content = await db.getNote(postUrl)
      if (content && content.content) {
        content.content = insertImagesAndVideos(content.content) // Resolve URLs before rendering
        // Assuming JSON-LD content has a "summary" field
        this.renderPostContent(content)
      }
    } catch (error) {
      console.error(error)
      this.renderErrorContent(error.message)
    }
  }

  async renderPostContent (jsonLdData) {
    // Clear existing content
    this.innerHTML = ''

    // Check if jsonLdData is an activity instead of a note
    if ('object' in jsonLdData) {
      this.renderErrorContent('Expected a Note but received an Activity')
      return
    }

    // Create the container for the post
    const postContainer = document.createElement('div')
    postContainer.classList.add('distributed-post')

    // Header for the post, which will contain actor info and published time
    const postHeader = document.createElement('header')
    postHeader.classList.add('distributed-post-header')

    // Determine the source of 'attributedTo' based on the structure of jsonLdData
    let attributedToSource = jsonLdData.attributedTo
    if ('object' in jsonLdData && 'attributedTo' in jsonLdData.object) {
      attributedToSource = jsonLdData.object.attributedTo
    }

    // Create elements for each field, using the determined source for 'attributedTo'
    if (attributedToSource) {
      const actorInfo = document.createElement('actor-info')
      actorInfo.setAttribute('url', attributedToSource)
      postHeader.appendChild(actorInfo)
    }

    // Published time element
    const publishedTime = document.createElement('a')
    publishedTime.href = `/post.html?url=${encodeURIComponent(db.getObjectPage(jsonLdData))}`
    publishedTime.classList.add('time-ago')
    const elapsed = timeSince(jsonLdData.published)
    publishedTime.textContent = elapsed
    postHeader.appendChild(publishedTime)

    // Append the header to the post container
    postContainer.appendChild(postHeader)

    // Main content of the post
    const postContent = document.createElement('div')
    postContent.classList.add('post-content')

    // Determine content source based on structure of jsonLdData
    const contentSource = jsonLdData.content || (jsonLdData.object && jsonLdData.object.content)
    const sanitizedContent = DOMPurify.sanitize(contentSource)
    const parser = new DOMParser()
    const contentDOM = parser.parseFromString(sanitizedContent, 'text/html')

    // Insert images and videos into the DOM
    const processedContent = insertImagesAndVideos(contentSource)

    // Process all anchor elements to handle actor and posts mentions
    const anchors = contentDOM.querySelectorAll('a')
    anchors.forEach(async (anchor) => {
      const href = anchor.getAttribute('href')
      if (href) {
        const fediverseActorMatch = href.match(/^(https?|ipns|hyper):\/\/([^\/]+)\/@(\w+)$/)
        const jsonldActorMatch = href.endsWith('about.jsonld')
        const mastodonPostMatch = href.match(/^(https?|ipns|hyper):\/\/([^\/]+)\/@(\w+)\/(\d+)$/)
        const jsonldPostMatch = href.endsWith('.jsonld')

        if (fediverseActorMatch || jsonldActorMatch) {
          anchor.setAttribute('href', `/profile.html?actor=${encodeURIComponent(href)}`)
          try {
            const actorData = await db.getActor(href)
            if (actorData) {
              anchor.setAttribute('href', `/profile.html?actor=${encodeURIComponent(href)}`)
            } else {
              console.log('Actor not found in DB, default redirection applied.')
            }
          } catch (error) {
            console.error('Error fetching actor data:', error)
          }
        } else if (mastodonPostMatch || jsonldPostMatch) {
          anchor.setAttribute('href', `/post.html?url=${encodeURIComponent(href)}`)
          try {
            const noteData = await db.getNote(href)
            if (noteData) {
              anchor.setAttribute('href', `/post.html?url=${encodeURIComponent(href)}`)
            } else {
              console.log('Post not found in DB, default redirection applied.')
            }
          } catch (error) {
            console.error('Error fetching note data:', error)
          }
        } else {
          anchor.setAttribute('href', href)
        }
      }
    })

    const isSensitive = jsonLdData.sensitive || (jsonLdData.object && jsonLdData.object.sensitive)
    const summary = jsonLdData.summary || (jsonLdData.object && jsonLdData.object.summary)

    if (isSensitive) {
      // Handle sensitive content
      const details = document.createElement('details')
      const summaryElement = document.createElement('summary')
      summaryElement.classList.add('cw-summary')
      summaryElement.textContent = 'Sensitive Content (click to view)'
      details.appendChild(summaryElement)

      const contentElement = document.createElement('p')
      contentElement.innerHTML = processedContent
      details.appendChild(contentElement)

      postContent.appendChild(details)
    } else if (summary) {
      // Handle content with summary
      const details = document.createElement('details')
      const summaryElement = document.createElement('summary')
      summaryElement.textContent = summary // Post title goes here
      details.appendChild(summaryElement)

      // Adding the "Show more" and "Show less" toggle text
      const toggleText = document.createElement('span')
      toggleText.textContent = 'Show more'
      toggleText.classList.add('see-more-toggle')
      summaryElement.appendChild(toggleText)

      const contentElement = document.createElement('p')
      contentElement.innerHTML = processedContent
      details.appendChild(contentElement)
      postContent.appendChild(details)

      // Event listener to toggle the text of the Show more/Show less element
      details.addEventListener('toggle', function () {
        toggleText.textContent = details.open ? 'Show less' : 'Show more'
      })
    } else {
      // Regular content without summary or sensitivity
      postContent.innerHTML = processedContent
    }

    // Append the content to the post container
    postContainer.appendChild(postContent)

    // Footer of the post, which will contain the full published date and platform, but only the date is clickable
    const postFooter = document.createElement('footer')
    postFooter.classList.add('post-footer')

    // Create a container for the full date and additional text
    const dateContainer = document.createElement('div')

    // Create the clickable link for the date
    const fullDateLink = document.createElement('a')
    fullDateLink.href = `/post.html?url=${encodeURIComponent(jsonLdData.id)}`
    fullDateLink.classList.add('full-date')
    fullDateLink.textContent = formatDate(jsonLdData.published)
    dateContainer.appendChild(fullDateLink)

    // Add the ' · reader web' text outside of the link
    const readerWebText = document.createElement('span')
    readerWebText.textContent = ' · reader web'
    dateContainer.appendChild(readerWebText)

    // Append the date container to the footer
    postFooter.appendChild(dateContainer)

    const replyFooter = document.createElement('div')
    replyFooter.classList.add('reply-footer')

    const replyCountElement = document.createElement('reply-count')
    replyCountElement.classList.add('reply-count')
    replyCountElement.setAttribute('url', jsonLdData.id)
    replyFooter.appendChild(replyCountElement)

    postFooter.appendChild(replyFooter)

    // Handle attachments of other Fedi instances
    if (!isSensitive && !jsonLdData.summary && jsonLdData.attachment && jsonLdData.attachment.length > 0) {
      const attachmentsContainer = document.createElement('div')
      attachmentsContainer.className = 'attachments-container'

      jsonLdData.attachment.forEach(attachment => {
        if (attachment.mediaType.startsWith('image/')) {
          // If it's an image
          const img = document.createElement('img')
          img.src = attachment.url
          img.alt = attachment.name || 'Attached image'
          img.className = 'attachment-image'
          attachmentsContainer.appendChild(img)
        } else if (attachment.mediaType.startsWith('video/')) {
          // If it's a video
          const video = document.createElement('video')
          video.src = attachment.url
          video.alt = attachment.name || 'Attached video'
          video.className = 'attachment-video'
          video.controls = true
          attachmentsContainer.appendChild(video)
        }
      })
      postContainer.appendChild(attachmentsContainer)
    }

    // Append the footer to the post container
    postContainer.appendChild(postFooter)

    // Append the whole post container to the custom element
    this.appendChild(postContainer)

    const params = new URLSearchParams(window.location.search)
    if (params.get('view') === 'replies') {
      const postReplies = document.createElement('post-replies')
      postReplies.setAttribute('url', jsonLdData.id)
      this.after(postReplies)
    }
  }

  // appendField to optionally allow HTML content
  appendField (label, value, isHTML = false) {
    if (value) {
      const p = document.createElement('p')
      const strong = document.createElement('strong')
      strong.textContent = `${label}:`
      p.appendChild(strong)
      if (isHTML) {
        // If the content is HTML, set innerHTML directly
        const span = document.createElement('span')
        span.innerHTML = value
        p.appendChild(span)
      } else {
        // If not, treat it as text
        p.appendChild(document.createTextNode(` ${value}`))
      }
      this.appendChild(p)
    }
  }

  renderErrorContent (errorMessage) {
    // Clear existing content
    this.innerHTML = ''

    const errorComponent = document.createElement('error-message')
    errorComponent.setAttribute('message', errorMessage)
    this.appendChild(errorComponent)
  }
}

// Register the new element with the browser
customElements.define('distributed-post', DistributedPost)

// Define a class for the <actor-info> web component
class ActorInfo extends HTMLElement {
  static get observedAttributes () {
    return ['url']
  }

  constructor () {
    super()
    this.actorUrl = ''
  }

  attributeChangedCallback (name, oldValue, newValue) {
    if (name === 'url' && newValue) {
      this.actorUrl = newValue
      this.fetchAndRenderActorInfo(newValue)
    }
  }

  navigateToActorProfile () {
    window.location.href = `/profile.html?actor=${encodeURIComponent(this.actorUrl)}`
  }

  async fetchAndRenderActorInfo (url) {
    try {
      const actorInfo = await db.getActor(url)
      if (actorInfo) {
        // Clear existing content
        this.innerHTML = ''

        const author = document.createElement('div')
        author.classList.add('distributed-post-author')

        const authorDetails = document.createElement('div')
        authorDetails.classList.add('actor-details')

        // Handle both single icon object and array of icons
        let iconUrl = './assets/profile.png' // Default profile image path
        if (actorInfo.icon) {
          if (Array.isArray(actorInfo.icon) && actorInfo.icon.length > 0) {
            iconUrl = actorInfo.icon[0].url || actorInfo.id
          } else if (actorInfo.icon.url) {
            iconUrl = actorInfo.icon.url || actorInfo.id
          }
        }

        const p2pImage = document.createElement('p2p-image')
        p2pImage.className = 'actor-icon'
        p2pImage.setAttribute('src', iconUrl)
        p2pImage.alt = actorInfo.name ? actorInfo.name : 'Actor icon'
        p2pImage.addEventListener('click', this.navigateToActorProfile.bind(this))
        author.appendChild(p2pImage)

        if (actorInfo.name) {
          const pName = document.createElement('div')
          pName.classList.add('actor-name')
          pName.textContent = actorInfo.name
          pName.addEventListener('click', this.navigateToActorProfile.bind(this))
          authorDetails.appendChild(pName)
        }

        if (actorInfo.preferredUsername) {
          const pUserName = document.createElement('div')
          pUserName.classList.add('actor-username')
          pUserName.textContent = `@${actorInfo.preferredUsername}`
          authorDetails.appendChild(pUserName)
        }
        // Append the authorDetails to the author div
        author.appendChild(authorDetails)
        // Append the author container to the actor-info component
        this.appendChild(author)
      }
    } catch (error) {
      const errorElement = renderError(error.message)
      this.appendChild(errorElement)
    }
  }
}

// Register the new element with the browser
customElements.define('actor-info', ActorInfo)
