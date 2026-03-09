const MAX_PARAGRAPH_GROUPS_PER_PAGE = 4;

function createLetterPage(letterPageTemplate, pageIndex) {
  const fragment = letterPageTemplate.content.cloneNode(true);
  const page = fragment.querySelector(".document__page");
  const content = page?.querySelector("[data-page-content]");

  if (!page || !content) {
    throw new Error("Print page template is missing required nodes.");
  }

  page.classList.add(pageIndex === 0 ? "document__page--first" : "document__page--continuation");
  content.classList.add(
    pageIndex === 0 ? "document__content--first" : "document__content--continuation"
  );

  return page;
}

function cloneBlocks(blocks = []) {
  return blocks.map((block) => block.cloneNode(true));
}

function appendBlocks(contentNode, blocks = []) {
  cloneBlocks(blocks).forEach((block) => {
    contentNode.append(block);
  });
}

function updateGeneratedPageClasses(pageHost) {
  const pages = Array.from(pageHost.querySelectorAll(".document__page"));
  pages.forEach((page, index) => {
    page.classList.toggle("document__page--first", index === 0);
    page.classList.toggle("document__page--continuation", index > 0);
  });
}

export function paginatePrintLayout(container) {
  const documentRoot = container.querySelector('[data-print-layout="paginated-letter"]');
  if (!documentRoot) {
    return false;
  }

  const letterPageTemplate = documentRoot.querySelector('template[data-print-template="letter-page"]');
  const pageHost = documentRoot.querySelector("[data-generated-pages]");
  const flowSource = documentRoot.querySelector("[data-print-flow]");

  if (!letterPageTemplate || !pageHost || !flowSource) {
    return false;
  }

  const blocks = Array.from(flowSource.children);
  const introBlocks = blocks.filter((block) =>
    block.classList.contains("document__flow-block--intro")
  );
  const paragraphBlocks = blocks.filter((block) =>
    block.classList.contains("document__flow-block--paragraph-group")
  );
  const closingBlocks = blocks.filter((block) =>
    block.classList.contains("document__flow-block--closing")
  );

  pageHost.innerHTML = "";

  let pageIndex = 0;
  let currentPage = createLetterPage(letterPageTemplate, pageIndex);
  let currentContent = currentPage.querySelector("[data-page-content]");
  pageHost.append(currentPage);

  appendBlocks(currentContent, introBlocks);

  if (paragraphBlocks.length === 0) {
    appendBlocks(currentContent, closingBlocks);
    updateGeneratedPageClasses(pageHost);
    return true;
  }

  for (let index = 0; index < paragraphBlocks.length; index += MAX_PARAGRAPH_GROUPS_PER_PAGE) {
    const chunk = paragraphBlocks.slice(index, index + MAX_PARAGRAPH_GROUPS_PER_PAGE);

    if (index > 0) {
      pageIndex += 1;
      currentPage = createLetterPage(letterPageTemplate, pageIndex);
      currentContent = currentPage.querySelector("[data-page-content]");
      pageHost.append(currentPage);
    }

    appendBlocks(currentContent, chunk);
  }

  appendBlocks(currentContent, closingBlocks);
  updateGeneratedPageClasses(pageHost);
  return true;
}
