# Revit CompoundStructureExtractor bundle for Forge Design Automation

[![Design Automation](https://img.shields.io/badge/Design%20Automation-v3-green.svg)](http://developer.autodesk.com/)

![Windows](https://img.shields.io/badge/Plugins-Windows-lightgrey.svg)
![.NET](https://img.shields.io/badge/.NET%20Framework-4.8-blue.svg)
[![Revit-2022](https://img.shields.io/badge/Revit-2022-lightgrey.svg)](http://autodesk.com/revit)


# Description

This sample demonstrates a way to retrieve quantities of materials for a Revit project based on a refference view,a mapping JSON file (to define the units for each material and proper ExportClassAs used by OneClick - just like class-mapping.json) and one JSON with parameters to define urn and viewname [Autodesk Revit IFC](https://github.com/Autodesk/revit-ifc)

# Development Setup

## Prerequisites

1. **Forge Account**: Learn how to create a Forge Account, activate subscription and create an app at [this tutorial](http://learnforge.autodesk.io/#/account/). 
2. **Visual Studio 2022** (Windows).
3. **Revit 2022**: required to compile changes into the plugin

## Design Automation Setup

### Activity example

```json
{
  "id": "RevitIfcExportorActivity",
  "commandLine": [
    "$(engine.path)\\\\revitcoreconsole.exe /i \"$(args[inputFile].path)\" /al \"$(appbundles[RevitIfcExportor].path)\""
  ],
  "parameters": {
    "inputFile": {
      "verb": "get",
      "description": "Input Revit File",
      "required": true,
      "localName": "$(inputFile)"
    },
    "params": {
      "verb": "get",
      "description": "parameters to define urn and viewname",
      "required": true,
      "localName": "params.json"
    },
    "mapping": {
      "verb": "get",
      "description": "define the units for each material and proper ExportClassAs used by OneClick",
      "required": true,
      "localName": "class-mapping.json"
    },
    "result": {
      "zip": false,
      "verb": "put",
      "description": "Extracted materials from model",
      "localName": "result.json"
    }
  },
  "engine": "Autodesk.Revit+2022",
  "appbundles": [
    "Autodesk.CompoundLayerExtractor+dev"
  ],
  "description": "Activity of Revit Materials exporter"
}
```

### Workitem example

```json
{
  "activityId": "ID OF THE ACTIVITY",
  "arguments": {
    "inputFile": {
      "url": "URL TO DOWNLOAD THE INPUT FILE (BIM360/ACC)",
      "Headers": {
        "Authorization": "Bearer TOKEN"
      }
    },
    "params": {
      "verb": "get",
      "url": "data:application/json,{'urn':'URN OF INPUT FILE TO TRACK THE RESULT', 'viewname':'NAME OF THE VIEW TO FILTER THE ELEMENTS'}"
    },
    "mapping": {
      "verb": "get",
      "url": "URL TO DOWNLOAD MAPPING JSON FILE"
    },
    "result": {
      "verb": "post",
      "url": "URL TO UPLOAD THE RESULT",
      "Headers": {
        "Content-Type": "application/json"
      }
    },
    "onProgress": {
      "verb": "post",
      "url": "URL TO RECEIVE PROGRESS INFORMATION",
      "Headers": {
        "Content-Type": "application/json"
      }
    },
    "onComplete": {
      "verb": "post",
      "url": "URL TO RECEIVE STATUS AFTER JOB EXECUTION",
      "Headers": {
        "Content-Type": "application/json"
      }
    }
  }
}
```

## License

This sample is licensed under the terms of the [MIT License](http://opensource.org/licenses/MIT). Please see the [LICENSE](LICENSE) file for full details.

## Written by

João Martins [@JooPaulodeOrne2](http://twitter.com/JooPaulodeOrne2), [Forge Partner Development](http://forge.autodesk.com)