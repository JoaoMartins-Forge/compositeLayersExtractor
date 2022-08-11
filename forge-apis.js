const fetch = require('node-fetch');
var MongoClient = require('mongodb').MongoClient;
// const classesInRevit = require('./class-mapping.json');

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET, BASEAPI, MONGO_CONNECTION_STRING, MONGO_DB_NAME } = require('./config.js');

class Forge {
	constructor(token) {
		this.header = { Authorization: `Bearer ${token}`, "Content-Type": "Application/json" };
		this.token = token;
		this.twoleggedtoken = "";
	}

	_header(token) {
		return { Authorization: `Bearer ${token}`, "Content-Type": "Application/json" };
	}

	async triggerJob(urn, viewable, fileurl) {
		const DAPluginToken = await this.get2leggedAuth();

		let downloadmappingURL = await this.getSignedURL("aux-oneclick-bucket", "class-mapping.json")

		const body = {
			//Hardcoded ActivityId
			"activityId": "ONECLICKPOC.CompoundExtractorDataDays+28thjuly22allda4r",
			// "activityId": config.ACTIVITYID,
			"arguments": {
				"inputFile": {
					"url": fileurl,
					"Headers": {
						"Authorization": `Bearer ${DAPluginToken}}`
					}
				},
				"params": {
					"verb": "get",
					"url": `data:application/json,{'urn':'${urn}', 'viewname':'${viewable}','options':{'walls':true,'floors':true,'ceilings':true,'extrusionroof':true,'footprintroof':true}}`
				},
				"mapping": {
					"verb": "get",
					"url": downloadmappingURL
				},
				"result": {
					"verb": "post",
					"url": `${BASEAPI}/urns/${urn + '|' + viewable}`,
					"Headers": {
						"Content-Type": `application/json`
					}
				},
				"onProgress": {
					"verb": "post",
					"url": `${BASEAPI}/jobs/${urn}`,
					"Headers": {
						"Content-Type": `application/json`
					}
				},
				"onComplete": {
					"verb": "post",
					"url": `${BASEAPI}/jobs/${urn}`,
					"Headers": {
						"Content-Type": `application/json`
					}
				}
			}
		};

		const res = await fetch(`https://developer.api.autodesk.com/da/us-east/v3/workitems`, {
			method: 'POST', headers: this._header(DAPluginToken), body: JSON.stringify(body)
		});
		const result = await res.json();
		return result;
	}

	async getSignedURL(bucketKey, objectKey) {
		this.twoleggedtoken = await this.get2leggedAuth();

		let downloadresult = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${objectKey}/signeds3download?minutesExpiration=60`, {
			"method": "GET",
			"headers": {
				"Authorization": `Bearer ${this.twoleggedtoken}`
			}
		});

		downloadresult = await downloadresult.json();
		return downloadresult.url;
	}

	async getFolderContents(project, folder) {
		const res = await fetch(`https://developer.api.autodesk.com/data/v1/projects/b.${project}/folders/${folder}/contents`, { headers: this.header });
		const jres = await res.json();
		if (!jres.included) return jres;

		let result = jres.included.map(i => {
			return ({
				urn: Buffer.from(i.id).toString('base64').replaceAll('/', '_'),
				filename: i.attributes.displayName,
				size: i.attributes.storageSize,
				lastModifiedTime: i.attributes.lastModifiedTime,
				lineage: i.relationships.item.data.id,
				version: i.attributes.versionNumber,
				datetime: (new Date(i.attributes.lastModifiedTime)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-'),
				url: `https://developer.api.autodesk.com/oss/v2/buckets/wip.dm.prod/objects/${i.relationships.storage.data.id.split('/')[1]}`
			})
		});

		result.sort((a, b) => {
			return (b.lastModifiedTime < a.lastModifiedTime) ? -1 : 1
		});

		return result;
	}

	calcHistogram(urn) {
		const histogram = new Map();
		urn.map(i => {
			const key = i.revitmaterial;
			if (histogram.has(key)) {
				const item = histogram.get(key);
				item.ids.push(i.externalId);
				if (item.materialareaqty) item.materialareaqty += i.materialareaqty;
				if (item.materialvolumeqty) item.materialvolumeqty += i.materialvolumeqty;
				if (item.elementlength) item.elementlength += i.elementlength;
			} else {
				histogram.set(key, { ids: [i.externalId], material: key, volume: i.materialvolumeqty, area: i.materialareaqty, length: i.elementlength });
			}
		});
		return histogram;
	}

	async deduplicateMaterials(urn, body) {
		const deduplicated = {
			"id": urn,
			"urn": urn,
			"results": []
		}

		if (!body.results) return;

		body.results.forEach(material => {
			let currentMaterial = deduplicated.results.find(m => m.CLASS === material.ifcclass && m.MATERIAL === material.revitmaterial)
			if (!!currentMaterial) {
				switch (currentMaterial.defaultunit) {
					case "area":
						currentMaterial.QUANTITY += material.materialareaqty;
						break;
					case "volume":
						currentMaterial.QUANTITY += material.materialvolumeqty;
						break;
					case "length":
						newMaterial.QUANTITY = material.elementlength;
						break;
					default:
						currentMaterial.QUANTITY += 1;
						break;
				}
			}
			else {
				let newMaterial = {
					CLASS: material.ifcclass,
					MATERIAL: material.revitmaterial,
					CATEGORY: material.revitcategory,
					LENGTH_M: material.elementlength,
					AREA_M2: material.materialareaqty,
					VOLUME_M3: material.materialvolumeqty,
					MATERIALGROUP: material.group
				};

				switch (material.defaultunit) {
					case "area":
						newMaterial.QUANTITY = material.materialareaqty;
						newMaterial.QTY_TYPE = "M2";
						break;
					case "volume":
						newMaterial.QUANTITY = material.materialvolumeqty;
						newMaterial.QTY_TYPE = "M3";
						break;
					case "length":
						newMaterial.QUANTITY = material.elementlength;
						newMaterial.QTY_TYPE = "M";
						break;
					default:
						newMaterial.QUANTITY = 1;
						newMaterial.QTY_TYPE = "UNIT";
						break;
				}
				deduplicated.results.push(newMaterial);
			}
		});
		return deduplicated;
	}

	async getModelViewables(urn, url) {
		this.twoleggedtoken = await this.get2leggedAuth();

		const res = await fetch(`https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/metadata`, {
			method: "GET",
			headers: this._header(this.twoleggedtoken)
		});

		if (res.status !== 200) {
			return null;
		}

		const jres = await res.json();

		let result = jres.data.metadata.map(i => {
			return ({
				urn: urn,
				filename: i.name,
				guid: i.guid,
				url: url
			})
		});

		return result;
	}

	async queryJob(urn, viewable) {
		const client = new MongoClient(MONGO_CONNECTION_STRING);
		let result;
		try {
			const db = await client.db(MONGO_DB_NAME);
			const collection = await db.collection("jobs");
			const findresult = await collection.findOne({ _id: `${urn}|${viewable}` });
			result = findresult ? findresult.status : "not triggered!";
		}
		finally {
			client.close();
		}
		return result;
	}

	async get2leggedAuth() {
		const url = `https://developer.api.autodesk.com/authentication/v1/authenticate`;
		const header = { 'Content-Type': 'application/x-www-form-urlencoded' };
		const body = `grant_type=client_credentials&client_id=${FORGE_CLIENT_ID}&client_secret=${FORGE_CLIENT_SECRET}&scope=data:read`;
		let token = await fetch(url, { method: 'POST', headers: header, body: body });
		token = await token.json();
		return token.access_token;
	}
}

module.exports = Forge;
