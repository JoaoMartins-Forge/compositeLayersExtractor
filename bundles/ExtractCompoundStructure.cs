using System;
using Autodesk.Revit.DB;
using DesignAutomationFramework;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.ApplicationServices;

namespace CompoundLayerExtractor
{
	[Regeneration(RegenerationOption.Manual)]
	[Transaction(TransactionMode.Manual)]
	public class ExtractCompoundStructure : IExternalDBApplication
	{
		public static void ExtractLayers(DesignAutomationData data)
		{

			InputParams inputParameters = JsonConvert.DeserializeObject<InputParams>(File.ReadAllText("params.json"));

			JObject classMapping = JObject.Parse(File.ReadAllText("class-mapping.json"));

			if (data == null) throw new ArgumentNullException(nameof(data));

			Application rvtApp = data.RevitApp;
			if (rvtApp == null) throw new InvalidDataException(nameof(rvtApp));

			string modelPath = data.FilePath;
			if (String.IsNullOrWhiteSpace(modelPath)) throw new InvalidDataException(nameof(modelPath));

			Document doc = data.RevitDoc;
			if (doc == null) throw new InvalidOperationException("Could not open document.");

			//JArray layersInfoResult = new JArray();
			dynamic urnResult = new JObject();
			urnResult.urn = inputParameters.urn;
			urnResult.results = new JArray();

			List<View> views = new FilteredElementCollector(doc).OfClass(typeof(View)).Cast<View>().ToList();

			ElementId viewId = null;

			try
			{
				viewId = views.Find(v => v.Name == inputParameters.viewname).Id;
			}
			catch (Exception ex)
			{
				Console.WriteLine($"View with name {inputParameters.viewname} not found, going through with the whole document!");
			}

			List<Element> elements = viewId != null ? new FilteredElementCollector(doc, viewId).WhereElementIsNotElementType().ToList() : new FilteredElementCollector(doc).WhereElementIsNotElementType().ToList();

			foreach (Element element in elements)
			{
				try
				{
					Category elementCategory = element.Category;
					ElementId categoryId = elementCategory.Id;

					JToken classMapped;
					bool hasEquivalentClass = classMapping.TryGetValue(categoryId.ToString(), out classMapped);

					List<ElementId> materialsIds = element.GetMaterialIds(false).ToList();

					foreach (ElementId materialId in materialsIds)
					{
						try
						{
							Element material = doc.GetElement(materialId);
							double materialArea = element.GetMaterialArea(materialId, false);
							double materialVolume = element.GetMaterialVolume(materialId);

							dynamic newMaterial = new JObject();
							newMaterial.externalId = element.UniqueId.ToString();
							newMaterial.revitcategory = elementCategory.Name;
							newMaterial.ifcclass = hasEquivalentClass ? classMapped.SelectToken("ExportClassAs").ToString() : "OTHER";
							newMaterial.revitmaterial = material.Name;
							newMaterial.materialareaqty = UnitUtils.ConvertFromInternalUnits(materialArea, UnitTypeId.SquareMeters);
							newMaterial.materialareaqtytype = UnitTypeId.SquareMeters.TypeId;
							newMaterial.materialvolumeqty = UnitUtils.ConvertFromInternalUnits(materialVolume, UnitTypeId.CubicMeters);
							newMaterial.materialvolumeqtytype = UnitTypeId.CubicMeters.TypeId;

							Parameter elementLength = element.LookupParameter("Length");
							newMaterial.elementlength = UnitUtils.ConvertFromInternalUnits(elementLength != null ? elementLength.AsDouble() : 0, UnitTypeId.Meters);
							newMaterial.elementlengthqtytype = UnitTypeId.Meters.TypeId;

							if (hasEquivalentClass)
							{
								newMaterial.group = classMapped.SelectToken("group").ToString();
								newMaterial.defaultunit = classMapped.SelectToken("DefaultUnit").ToString();
								newMaterial.name = classMapped.SelectToken("Name").ToString();
								newMaterial.availableunits = classMapped.SelectToken("AvailableUnits").ToString();
							}

							urnResult.results.Add(newMaterial);
						}
						catch (Exception ex)
						{
							Console.WriteLine($"Error with material {materialId} from element {element.UniqueId}!");
							Console.WriteLine(ex.Message);
						}
					}
				}
				catch (Exception ex)
				{
					Console.WriteLine($"Error with element {element.UniqueId}!");
					Console.WriteLine(ex.Message);
				}

			}

			// save all to a .json file
			using (StreamWriter file = File.CreateText("result.json"))
			using (JsonTextWriter writer = new JsonTextWriter(file))
			{
				urnResult.WriteTo(writer);
			}

		}

		public ExternalDBApplicationResult OnShutdown(ControlledApplication application)
		{
			return ExternalDBApplicationResult.Succeeded;
		}

		public ExternalDBApplicationResult OnStartup(ControlledApplication application)
		{
			DesignAutomationBridge.DesignAutomationReadyEvent += HandleDesignAutomationReadyEvent;
			return ExternalDBApplicationResult.Succeeded;
		}

		private void HandleDesignAutomationReadyEvent(object sender, DesignAutomationReadyEventArgs e)
		{
			e.Succeeded = true;
			ExtractLayers(e.DesignAutomationData);
		}
	}

	public class InputParams
	{
		public string urn { get; set; }

		public string viewname { get; set; }
		
	}
}
