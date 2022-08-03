const forgeApi = require('./forge-apis');
const session = require('cookie-session');
const { getAuthorizationUrl, authCallbackMiddleware, authRefreshMiddleware, getUserProfile } = require('./services/forge/auth.js');
const { getHubs, getProjects, getProjectContents, getItemVersions } = require('./services/forge/hubs.js');

const { PORT, SERVER_SESSION_SECRET } = require('./config.js');

const jsonServer = require('json-server');
const server = jsonServer.create();
const router = jsonServer.router('db.json');
const middlewares = jsonServer.defaults({ static: 'wwwroot', bodyParser: true });
server.use(middlewares);
server.use(session({ secret: SERVER_SESSION_SECRET, maxAge: 24 * 60 * 60 * 1000 }));

server.get('/test', function (req, res) {
	console.log('THIS WORKS');
});

//Auth routes
server.get('/api/auth/login', function (req, res) {
	res.redirect(getAuthorizationUrl());
});

server.get('/api/auth/logout', function (req, res) {
	req.session = null;
	res.redirect('/');
});

server.get('/api/auth/callback', authCallbackMiddleware, function (req, res) {
	res.redirect('/');
});

server.get('/api/auth/token', authRefreshMiddleware, function (req, res) {
	res.json(req.publicOAuthToken);
});

server.get('/api/auth/profile', authRefreshMiddleware, async function (req, res, next) {
	try {
		const profile = await getUserProfile(req.internalOAuthToken);
		res.json({ name: `${profile.firstName} ${profile.lastName}` });
	} catch (err) {
		next(err);
	}
});

//DB routes
server.get('/job/trigger', async (req, res) => {
	const _forgeApi = new forgeApi();
	const result = await _forgeApi.triggerJob(req.query.urn, req.query.viewable, req.query.fileurl);
	const workItemId = result.id;
	router.db.get("jobs").insert({ id: workItemId, workItemId: workItemId, urn: req.query.urn, time: Date().toString(), status: "queued", reportUrl: "", stats: "" }).write();
	res.jsonp(result);
});

server.post('/jobs/:urn', function (req, res) {
	req.body.workItemId = req.body.id;
	req.body.urn = req.params.urn;
	if (!req.body.status) req.body.status = "processing";
	req.body.time = Date().toString();
	console.info("job:", req.body);
	addreplaceURN("jobs", req.body.workItemId, req.body);
	res.sendStatus(200);
});

server.post('/urns/:urn', async function (req, res) {
	req.body.id = req.params.urn;
	const _forgeApi = new forgeApi();
	addreplaceURN("allinstances", req.params.urn, req.body);
	const deduplicated = _forgeApi.calcHistogram(req.body.results).values();
	addreplaceURN("deduplicated", req.params.urn, { id: req.params.urn, results: Array.from(deduplicated) });
	// const results = await _forgeApi.injectAdditionalProperties(req.params.urn, req.body)
	const results = await _forgeApi.deduplicateMaterials(req.params.urn, req.body);
	addreplaceURN("urns", req.params.urn, results);
	res.sendStatus(200);
});

// add/replace keys[urn] = data
// make the URN's data mutable.
function addreplaceURN(key, urn, data) {
	const chain = router.db.get(key);
	const exists = chain.getById(urn);
	if (exists.value())
		chain.updateById(urn, data).write();
	else
		chain.insert(data).write();
}


//Hubs routes
server.get('/api/hubs/', authRefreshMiddleware, async function (req, res, next) {
	try {
		const hubs = await getHubs(req.internalOAuthToken);
		res.json(hubs);
	} catch (err) {
		next(err);
	}
});

server.get('/api/hubs/:hub_id/projects', authRefreshMiddleware, async function (req, res, next) {
	try {
		const projects = await getProjects(req.params.hub_id, req.internalOAuthToken);
		res.json(projects);
	} catch (err) {
		next(err);
	}
});

server.get('/api/hubs/:hub_id/projects/:project_id/contents', authRefreshMiddleware, async function (req, res, next) {
	try {
		const contents = await getProjectContents(req.params.hub_id, req.params.project_id, req.query.folder_id, req.internalOAuthToken);
		res.json(contents);
	} catch (err) {
		next(err);
	}
});

server.get('/api/hubs/:hub_id/projects/:project_id/contents/:item_id/versions', authRefreshMiddleware, async function (req, res, next) {
	try {
		const versions = await getItemVersions(req.params.project_id, req.params.item_id, req.internalOAuthToken);
		res.json(versions);
	} catch (err) {
		next(err);
	}
});

server.get('/views/list', async (req, res) => {
	const _forgeApi = new forgeApi();
	const result = await _forgeApi.getModelViewables(req.query.urn, req.query.url);
	res.jsonp(result);
})

server.use(router);

server.listen(PORT, () => {
	console.info('JSON server running on port %d', PORT);
});
