const forgeApi = require('./forge-apis');
const session = require('cookie-session');
const { getAuthorizationUrl, authCallbackMiddleware, authRefreshMiddleware, getUserProfile } = require('./services/forge/auth.js');
const { getHubs, getProjects, getProjectContents, getItemVersions } = require('./services/forge/hubs.js');
var MongoClient = require('mongodb').MongoClient;

const { PORT, SERVER_SESSION_SECRET, MONGO_CONNECTION_STRING, MONGO_DB_NAME } = require('./config.js');

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

server.get('/job/status', async (req, res) => {
	const _forgeApi = new forgeApi();
	const result = await _forgeApi.queryJob(req.query.urn, req.query.viewable);
	res.jsonp(result);
});

//DB routes
server.get('/job/trigger', async (req, res) => {
	const _forgeApi = new forgeApi();
	const result = await _forgeApi.triggerJob(req.query.urn, req.query.viewable, req.query.fileurl);
	addreplacetoMongoDB(`${req.query.urn}|${req.query.viewable}`, result, "jobs");
	res.jsonp(result);
});

server.get('/jobs/:id', async (req, res) => {
	const result = await readFromMongoDB('jobs', req.params.id);
	res.jsonp(result);
});

server.get('/urns/:id', async (req, res) => {
	const result = await readFromMongoDB('urns', req.params.id);
	res.jsonp(result);
});

server.get('/deduplicated/:id', async (req, res) => {
	const result = await readFromMongoDB('deduplicated', req.params.id);
	res.jsonp(result);
});

server.get('/allinstances/:id', async (req, res) => {
	const result = await readFromMongoDB('allinstances', req.params.id);
	res.jsonp(result);
});

server.get('/carbons/:id', async (req, res) => {
	const result = await readFromMongoDB('carbons', req.params.id);
	res.jsonp(result);
});

async function readFromMongoDB(collectionname, id) {
	const client = new MongoClient(MONGO_CONNECTION_STRING);
	let result;
	try {
		const db = await client.db(MONGO_DB_NAME);
		const collection = await db.collection(collectionname);
		const findresult = await collection.findOne({ _id: id });
		result = findresult ? findresult : "not found!";
	}
	finally {
		client.close();
	}
	return result;
}

server.post('/jobs/:urn', function (req, res) {
	console.info("job:", req.body);
	updateJobStatus(req.body);
	res.sendStatus(200);
});

async function updateJobStatus(jobData) {
	const client = new MongoClient(MONGO_CONNECTION_STRING);
	try {
		const db = await client.db(MONGO_DB_NAME);
		const collection = await db.collection("jobs");
		const filter = { id: jobData.id };
		if (!jobData.status) {
			jobData.status = 'inprogress'
		}
		const findresult = await collection.replaceOne(filter, jobData);
	}
	finally {
		client.close();
	}
}

server.post('/carbons/:urn', async function (req, res) {
	req.body.id = req.params.urn;
	addreplaceURN(req.body.id, req.body, "carbons");
	res.sendStatus(200);
});

server.post('/urns/:urn', async function (req, res) {
	req.body.id = req.params.urn;
	const _forgeApi = new forgeApi();
	addreplacetoMongoDB(req.body.id, req.body, "allinstances");
	const deduplicated = _forgeApi.calcHistogram(req.body.results).values();
	addreplacetoMongoDB(req.body.id, { id: req.params.urn, results: Array.from(deduplicated) }, "deduplicated");
	const results = await _forgeApi.deduplicateMaterials(req.params.urn, req.body);
	addreplacetoMongoDB(req.body.id, results, "urns");

	res.sendStatus(200);
});

async function addreplacetoMongoDB(dataId, dataBody, collectionName) {
	const client = new MongoClient(MONGO_CONNECTION_STRING);
	try {
		const db = await client.db(MONGO_DB_NAME);
		const collection = await db.collection(collectionName);
		const findresult = await collection.findOne({ _id: dataId });
		if (findresult) {
			const filter = { _id: dataId };
			const replaceresult = await collection.replaceOne(filter, dataBody);
		}
		else {
			dataBody._id = dataId;
			const insertresult = await collection.insertOne(dataBody);
		}
	}
	finally {
		client.close();
	}
}

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
