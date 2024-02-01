const ACCEPT_HEADER =
  "application/activity+json, application/ld+json, application/json, text/html";

async function loadPost(url) {
  try {
    const headers = new Headers({ Accept: ACCEPT_HEADER });

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const contentType = response.headers.get("content-type");
    if (
      contentType.includes("application/ld+json") ||
      contentType.includes("application/activity+json") ||
      contentType.includes("application/json")
    ) {
      // Directly return JSON-LD if the response is JSON-LD or ActivityPub type
      return await response.json();
    } else {
      // Return HTML content for further processing if the response is HTML
      return await response.text();
    }
  } catch (error) {
    console.error("Error fetching post:", error);
  }
}

async function parsePostHtml(htmlContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, "text/html");
  const alternateLink = doc.querySelector('link[rel="alternate"]');
  return alternateLink ? alternateLink.href : null;
}

async function fetchJsonLd(jsonLdUrl) {
  try {
    const headers = new Headers({
      Accept: "application/ld+json",
    });

    const response = await fetch(jsonLdUrl, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching JSON-LD:", error);
  }
}

// async function loadPostFromIpfs(ipfsUrl) {
//   try {
//     // Try loading content using native IPFS URLs
//     const nativeResponse = await fetch(ipfsUrl);
//     if (nativeResponse.ok) {
//       return await nativeResponse.text();
//     }
//   } catch (error) {
//     console.log("Native IPFS loading failed, trying HTTP gateway:", error);
//   }

//   // Fallback to loading content via an HTTP IPFS gateway
//   const gatewayUrl = ipfsUrl.replace("ipfs://", "https://dweb.link/ipfs/");
//   try {
//     const gatewayResponse = await fetch(gatewayUrl);
//     if (!gatewayResponse.ok) {
//       throw new Error(`HTTP error! Status: ${gatewayResponse.status}`);
//     }
//     return await gatewayResponse.text();
//   } catch (error) {
//     console.error("Error fetching IPFS content via HTTP gateway:", error);
//   }
// }

async function fetchActorInfo(actorUrl) {
  try {
    const response = await fetch(actorUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching actor info:", error);
  }
}

function renderError(message) {
  const errorElement = document.createElement("p");
  errorElement.classList.add("error");
  errorElement.textContent = message;
  return errorElement;
}

// Define a class for the <distributed-post> web component
class DistributedPost extends HTMLElement {
  static get observedAttributes() {
    return ["url"];
  }

  connectedCallback() {
    this.loadAndRenderPost(this.getAttribute("url"));
  }

  async loadAndRenderPost(postUrl) {
    if (!postUrl) {
      this.renderErrorContent("No post URL provided");
      return;
    }

    let htmlContent;
    try {
      // if (postUrl.startsWith("ipfs://")) {
      //   htmlContent = await loadPostFromIpfs(postUrl);
      // }
      if (postUrl.startsWith("ipns://") || postUrl.startsWith("hyper://")) {
        // Directly load content for ipns and hyper URLs
        const nativeResponse = await fetch(postUrl);
        if (!nativeResponse.ok) {
          throw new Error(`HTTP error! Status: ${nativeResponse.status}`);
        }
        htmlContent = await nativeResponse.text();
      } else {
        htmlContent = await loadPost(postUrl);
      }

      const jsonLdUrl = await parsePostHtml(htmlContent);
      if (jsonLdUrl) {
        const jsonLdData = await fetchJsonLd(jsonLdUrl);
        this.renderPostContent(jsonLdData);
      } else {
        this.renderErrorContent("JSON-LD URL not found in the post");
      }
    } catch (error) {
      this.renderErrorContent(error.message);
    }
  }

  renderPostContent(jsonLdData) {
    // Clear existing content
    while (this.firstChild) {
      this.removeChild(this.firstChild);
    }

    // Create elements for each field
    if (jsonLdData.attributedTo) {
      const actorInfo = document.createElement("actor-info");
      actorInfo.setAttribute("url", jsonLdData.attributedTo);
      this.appendChild(actorInfo);
    }

    this.appendField("Summary", jsonLdData.summary);
    this.appendField("Published", jsonLdData.published);
    this.appendField("Author", jsonLdData.attributedTo);
    this.appendField("Content", jsonLdData.content);

    if (jsonLdData.sensitive) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Sensitive Content (click to view)";
      details.appendChild(summary);
      const content = document.createElement("p");
      content.textContent = jsonLdData.sensitive;
      details.appendChild(content);
      this.appendChild(details);
    }
  }

  appendField(label, value) {
    if (value) {
      const p = document.createElement("p");
      const strong = document.createElement("strong");
      strong.textContent = `${label}:`;
      p.appendChild(strong);
      p.appendChild(document.createTextNode(` ${value}`));
      this.appendChild(p);
    }
  }

  renderErrorContent(errorMessage) {
    // Clear existing content
    while (this.firstChild) {
      this.removeChild(this.firstChild);
    }

    const errorElement = document.createElement("p");
    errorElement.className = "error";
    errorElement.textContent = errorMessage;
    this.appendChild(errorElement);
  }
}

// Register the new element with the browser
customElements.define("distributed-post", DistributedPost);

// Define a class for the <actor-info> web component
class ActorInfo extends HTMLElement {
  static get observedAttributes() {
    return ["url"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "url" && newValue) {
      this.fetchAndRenderActorInfo(newValue);
    }
  }

  async fetchAndRenderActorInfo(url) {
    try {
      const actorInfo = await fetchActorInfo(url);
      if (actorInfo) {
        // Render the actor's avatar and name
        // Clear existing content
        while (this.firstChild) {
          this.removeChild(this.firstChild);
        }
        const pName = document.createElement("p");
        pName.textContent = actorInfo.name;
        const img = document.createElement("img");
        img.src = actorInfo.icon[0].url;
        img.width = 69;
        img.alt = actorInfo.name;
        const pSummary = document.createElement("p");
        pSummary.textContent = actorInfo.summary;
        this.appendChild(pName);
        this.appendChild(img);
        this.appendChild(pSummary);
      }
    } catch (error) {
      const errorElement = renderError(error.message);
      this.appendChild(errorElement);
    }
  }
}

// Register the new element with the browser
customElements.define("actor-info", ActorInfo);
