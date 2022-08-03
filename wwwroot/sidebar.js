async function getJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    alert('Could not load tree data. See console for more details.');
    console.error(await resp.text());
    return [];
  }
  return resp.json();
}

function createTreeNode(id, text, icon, children = false) {
  return { id, text, children, itree: { icon } };
}

async function getHubs() {
  const hubs = await getJSON('/api/hubs');
  return hubs.map(hub => createTreeNode(`hub|${hub.id}`, hub.attributes.name, 'icon-hub', true));
}

async function getProjects(hubId) {
  const projects = await getJSON(`/api/hubs/${hubId}/projects`);
  return projects.map(project => createTreeNode(`project|${hubId}|${project.id}`, project.attributes.name, 'icon-project', true));
}

async function getContents(hubId, projectId, folderId = null) {
  const contents = await getJSON(`/api/hubs/${hubId}/projects/${projectId}/contents` + (folderId ? `?folder_id=${folderId}` : ''));
  return contents.map(item => {
    if (item.type === 'folders') {
      return createTreeNode(`folder|${hubId}|${projectId}|${item.id}`, item.attributes.displayName, 'icon-my-folder', true);
    } else {
      return createTreeNode(`item|${hubId}|${projectId}|${item.id}`, item.attributes.displayName, 'icon-item', true);
    }
  });
}

async function getVersions(hubId, projectId, itemId) {
  const versions = await getJSON(`/api/hubs/${hubId}/projects/${projectId}/contents/${itemId}/versions`);
  return versions.map(version => createTreeNode(`version|${version.id}`, version.attributes.createTime, 'icon-version'));
}

async function getViewables(hubId, projectId, itemId) {
  const versions = await getJSON(`/api/hubs/${hubId}/projects/${projectId}/contents/${itemId}/versions`);
  const latestId = btoa(versions[0].id).replace('/', '_');
  const url = `/views/list?urn=${latestId}&url=${latestId}`;
  const viewables = await (await fetch(url, { mode: 'cors' })).json();
  const link = versions[0].relationships.storage.meta.link.href.split('?')[0];
  return viewables.map(viewable => createTreeNode(`version|${viewable.urn}|${viewable.guid}|${link}`, viewable.filename, 'icon-version'));
}

export function initTree(selector, onSelectionChanged) {
  // See http://inspire-tree.com
  const tree = new InspireTree({
    data: function (node) {
      if (!node || !node.id) {
        return getHubs();
      } else {
        const tokens = node.id.split('|');
        switch (tokens[0]) {
          case 'hub': return getProjects(tokens[1]);
          case 'project': return getContents(tokens[1], tokens[2]);
          case 'folder': return getContents(tokens[1], tokens[2], tokens[3]);
          case 'item': return getViewables(tokens[1], tokens[2], tokens[3]);
          default: return [];
        }
      }
    }
  });
  tree.on('node.click', function (event, node) {
    event.preventTreeDefault();
    const tokens = node.id.split('|');
    if (tokens[0] === 'version') {
      onSelectionChanged(tokens[1], tokens[2]);
      triggerJob(tokens[1], tokens[2], tokens[3]);
    }
  });
  return new InspireTreeDOM(tree, { target: selector });
}

async function triggerJob(urn, viewable, fileurl) {
  const url = `/job/trigger?urn=${urn}&viewable=${viewable}&fileurl=${fileurl}`;
  const res = await (await fetch(url, { mode: 'cors' })).json();
  // this.showtoast(res);
  showtoast(res);
  console.log(res);
}

async function showtoast(res) {
  Swal.fire({
    toast: true,
    icon: 'success',
    title: JSON.stringify(res),
    animation: false,
    position: 'bottom',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => {
      toast.addEventListener('mouseenter', Swal.stopTimer)
      toast.addEventListener('mouseleave', Swal.resumeTimer)
    }
  })
}