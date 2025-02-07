"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var async_1 = require("async");
var child_process_1 = require("child_process");
var fs = require("fs-extra");
var path = require("path");
var configuration_1 = require("./configuration");
var endpoints_1 = require("./endpoints");
var extension_version_1 = require("./extension-version");
var tasks_1 = require("./tasks");
var currentDirectory = process.cwd();
var buildOutputDirectory = path.join(currentDirectory, ".BuildOutput");
var extensionDirectory = path.join(currentDirectory, "Extension");
var tasksDirectory = path.join(currentDirectory, "Tasks");
fs.ensureDirSync(buildOutputDirectory);
var version = extension_version_1.getSemanticVersion();
var configuration = configuration_1.getConfiguration();
var createExtensionTasks = configuration.environments.map(function (env) {
    var environmentDirectory = path.join(buildOutputDirectory, env.Name);
    var environmentTasksDirectory = path.join(environmentDirectory, "Tasks");
    fs.ensureDirSync(environmentDirectory);
    fs.copySync(extensionDirectory, environmentDirectory, { overwrite: true, dereference: true });
    fs.copySync(tasksDirectory, environmentTasksDirectory, { overwrite: true, dereference: true });
    var extensionFilePath = path.join(environmentDirectory, "vss-extension.json");
    var extension = fs.readJsonSync(extensionFilePath);
    extension.id += env.VssExtensionIdSuffix;
    extension.name += env.DisplayNamesSuffix;
    extension.version = version.getVersionString();
    extension.galleryFlags = env.VssExtensionGalleryFlags;
    if (extension.contributions === undefined) {
        extension.contributions = [];
    }
    var endpointMap = {};
    endpoints_1.getEndpoints().forEach(function (endpoint) {
        endpointMap["connectedService:" + endpoint.name]
            = "connectedService:" + endpoint.name + env.VssExtensionIdSuffix;
        var config = endpoint.manifest;
        config.id = config.id + env.VssExtensionIdSuffix;
        config.properties.name = endpoint.name + env.VssExtensionIdSuffix;
        config.properties.displayName = config.properties.displayName + env.DisplayNamesSuffix;
        extension.contributions.push(config);
    });
    tasks_1.getTasks(environmentTasksDirectory).map(function (taskDirectory) {
        var taskFilePath = path.join(taskDirectory.directory, "task.json");
        var task = fs.readJsonSync(taskFilePath);
        task.id = env.TaskIds[taskDirectory.name];
        if (task.id) {
            task.friendlyName += env.DisplayNamesSuffix;
            task.version = {
                Major: version.major,
                Minor: version.minor,
                Patch: version.patch,
            };
            if (task.helpMarkDown) {
                task.helpMarkDown = task.helpMarkDown.replace("#{Version}#", version.getVersionString());
            }
            if (task.inputs) {
                task.inputs.forEach(function (input) {
                    var mappedType = endpointMap[input.type];
                    if (mappedType) {
                        input.type = mappedType;
                    }
                });
            }
            fs.writeJsonSync(taskFilePath, task);
            var taskLocFilePath = path.join(taskDirectory.directory, "task.loc.json");
            if (fs.existsSync(taskLocFilePath)) {
                var taskLoc = fs.readJsonSync(taskLocFilePath);
                taskLoc.id = env.TaskIds[taskDirectory.name];
                taskLoc.friendlyName += env.DisplayNamesSuffix;
                taskLoc.version.Major = version.major;
                taskLoc.version.Minor = version.minor;
                taskLoc.version.Patch = version.patch;
                if (taskLoc.helpMarkDown) {
                    taskLoc.helpMarkDown = taskLoc.helpMarkDown.replace("#{Version}#", version.getVersionString());
                }
                fs.writeJsonSync(taskLocFilePath, taskLoc);
                var locfilesDirectory = path.join(taskDirectory.directory, "Strings/resources.resjson");
                if (fs.existsSync(locfilesDirectory)) {
                    var langs = fs.readdirSync(locfilesDirectory);
                    for (var _i = 0, langs_1 = langs; _i < langs_1.length; _i++) {
                        var element = langs_1[_i];
                        var resourceFile = path.join(locfilesDirectory, element, "resources.resjson");
                        if (fs.existsSync(resourceFile)) {
                            var resource = fs.readJsonSync(resourceFile);
                            resource["loc.helpMarkDown"] = resource["loc.helpMarkDown"]
                                .replace("#{Version}#", version.getVersionString());
                            fs.writeJsonSync(resourceFile, resource);
                        }
                    }
                }
            }
            var taskId = taskDirectory.name.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^[-]+/, "");
            extension.contributions.push({
                description: task.description,
                id: taskId + "-task",
                properties: {
                    name: "Tasks/" + taskDirectory.name,
                },
                targets: [
                    "ms.vss-distributed-task.tasks",
                ],
                type: "ms.vss-distributed-task.task",
            });
        }
        else {
            fs.removeSync(taskDirectory.directory);
        }
    });
    fs.writeJsonSync(extensionFilePath, extension);
    var cmdline = 'tfx extension create --root "' + environmentDirectory
        + '" --manifest-globs "' + extensionFilePath
        + '" --output-path "' + environmentDirectory + '"';
    return function (done) {
        child_process_1.exec(cmdline, {}, function (error, stdout, stderr) {
            if (error) {
                console.error("exec error: " + error);
                done(error);
                return;
            }
            console.log("tfx extension create done for " + env.Name);
            if (stdout) {
                console.log(stdout);
            }
            if (stderr) {
                console.error(stderr);
            }
            done();
        });
    };
});
async_1.series(createExtensionTasks, function (err) {
    if (err) {
        console.error("Failed to create extensions.");
        throw err;
    }
});
