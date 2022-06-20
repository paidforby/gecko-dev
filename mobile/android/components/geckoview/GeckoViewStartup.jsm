/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var EXPORTED_SYMBOLS = ["GeckoViewStartup"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
const { GeckoViewUtils } = ChromeUtils.import(
  "resource://gre/modules/GeckoViewUtils.jsm"
);

const lazy = {};

XPCOMUtils.defineLazyServiceGetters(lazy, {
  gCertDB: ["@mozilla.org/security/x509certdb;1", "nsIX509CertDB"]
});

XPCOMUtils.defineLazyModuleGetters(lazy, {
  ActorManagerParent: "resource://gre/modules/ActorManagerParent.jsm",
  FileUtils: "resource://gre/modules/FileUtils.jsm",
  EventDispatcher: "resource://gre/modules/Messaging.jsm",
  Preferences: "resource://gre/modules/Preferences.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

const { debug, warn } = GeckoViewUtils.initLogging("Startup");

XPCOMUtils.defineLazyGetter(lazy, "log", () => {
  let { ConsoleAPI } = ChromeUtils.import("resource://gre/modules/Console.jsm");
  return new ConsoleAPI({
    prefix: "Policies.jsm",
    // tip: set maxLogLevel to "debug" and use log.debug() to create detailed
    // messages during development. See LOG_LEVELS in Console.jsm for details.
    maxLogLevel: "error",
    maxLogLevelPref: "error",
  });
});

var { DelayedInit } = ChromeUtils.import(
  "resource://gre/modules/DelayedInit.jsm"
);

function InitLater(fn, object, name) {
  return DelayedInit.schedule(fn, object, name, 15000 /* 15s max wait */);
}

const JSPROCESSACTORS = {
  GeckoViewPermissionProcess: {
    parent: {
      moduleURI: "resource:///actors/GeckoViewPermissionProcessParent.jsm",
    },
    child: {
      moduleURI: "resource:///actors/GeckoViewPermissionProcessChild.jsm",
      observers: [
        "getUserMedia:ask-device-permission",
        "getUserMedia:request",
        "recording-device-events",
        "PeerConnection:request",
      ],
    },
  },
};

const JSWINDOWACTORS = {
  LoadURIDelegate: {
    parent: {
      moduleURI: "resource:///actors/LoadURIDelegateParent.jsm",
    },
    child: {
      moduleURI: "resource:///actors/LoadURIDelegateChild.jsm",
    },
    messageManagerGroups: ["browsers"],
  },
  GeckoViewPermission: {
    parent: {
      moduleURI: "resource:///actors/GeckoViewPermissionParent.jsm",
    },
    child: {
      moduleURI: "resource:///actors/GeckoViewPermissionChild.jsm",
    },
    allFrames: true,
    includeChrome: true,
  },
  GeckoViewPrompt: {
    child: {
      moduleURI: "resource:///actors/GeckoViewPromptChild.jsm",
      events: {
        click: { capture: false, mozSystemGroup: true },
        contextmenu: { capture: false, mozSystemGroup: true },
        mozshowdropdown: {},
        "mozshowdropdown-sourcetouch": {},
        MozOpenDateTimePicker: {},
        DOMPopupBlocked: { capture: false, mozSystemGroup: true },
      },
    },
    allFrames: true,
    messageManagerGroups: ["browsers"],
  },
  GeckoViewFormValidation: {
    child: {
      moduleURI: "resource:///actors/GeckoViewFormValidationChild.jsm",
      events: {
        MozInvalidForm: {},
      },
    },
    allFrames: true,
    messageManagerGroups: ["browsers"],
  },
};

class GeckoViewStartup {
  /* ----------  nsIObserver  ---------- */
  observe(aSubject, aTopic, aData) {
    debug`observe: ${aTopic}`;
    switch (aTopic) {
      case "content-process-ready-for-script":
      case "app-startup": {
        GeckoViewUtils.addLazyGetter(this, "GeckoViewConsole", {
          module: "resource://gre/modules/GeckoViewConsole.jsm",
        });

        GeckoViewUtils.addLazyGetter(this, "GeckoViewStorageController", {
          module: "resource://gre/modules/GeckoViewStorageController.jsm",
          ged: [
            "GeckoView:ClearData",
            "GeckoView:ClearSessionContextData",
            "GeckoView:ClearHostData",
            "GeckoView:ClearBaseDomainData",
            "GeckoView:GetAllPermissions",
            "GeckoView:GetPermissionsByURI",
            "GeckoView:SetPermission",
            "GeckoView:SetPermissionByURI",
          ],
        });

        GeckoViewUtils.addLazyGetter(this, "GeckoViewPushController", {
          module: "resource://gre/modules/GeckoViewPushController.jsm",
          ged: ["GeckoView:PushEvent", "GeckoView:PushSubscriptionChanged"],
        });

        GeckoViewUtils.addLazyPrefObserver(
          {
            name: "geckoview.console.enabled",
            default: false,
          },
          {
            handler: _ => this.GeckoViewConsole,
          }
        );

        // Parent process only
        if (
          lazy.Services.appinfo.processType ==
          lazy.Services.appinfo.PROCESS_TYPE_DEFAULT
        ) {
          lazy.ActorManagerParent.addJSWindowActors(JSWINDOWACTORS);
          lazy.ActorManagerParent.addJSProcessActors(JSPROCESSACTORS);

          GeckoViewUtils.addLazyGetter(this, "GeckoViewWebExtension", {
            module: "resource://gre/modules/GeckoViewWebExtension.jsm",
            ged: [
              "GeckoView:ActionDelegate:Attached",
              "GeckoView:BrowserAction:Click",
              "GeckoView:PageAction:Click",
              "GeckoView:RegisterWebExtension",
              "GeckoView:UnregisterWebExtension",
              "GeckoView:WebExtension:CancelInstall",
              "GeckoView:WebExtension:Disable",
              "GeckoView:WebExtension:Enable",
              "GeckoView:WebExtension:EnsureBuiltIn",
              "GeckoView:WebExtension:Get",
              "GeckoView:WebExtension:Install",
              "GeckoView:WebExtension:InstallBuiltIn",
              "GeckoView:WebExtension:List",
              "GeckoView:WebExtension:PortDisconnect",
              "GeckoView:WebExtension:PortMessageFromApp",
              "GeckoView:WebExtension:SetPBAllowed",
              "GeckoView:WebExtension:Uninstall",
              "GeckoView:WebExtension:Update",
            ],
            observers: [
              "devtools-installed-addon",
              "testing-installed-addon",
              "testing-uninstalled-addon",
            ],
          });

          GeckoViewUtils.addLazyGetter(this, "ChildCrashHandler", {
            module: "resource://gre/modules/ChildCrashHandler.jsm",
            observers: ["ipc:content-shutdown", "compositor:process-aborted"],
          });

          lazy.EventDispatcher.instance.registerListener(this, [
            "GeckoView:StorageDelegate:Attached",
          ]);
        }
        break;
      }

      case "profile-after-change": {
        GeckoViewUtils.addLazyGetter(this, "GeckoViewRemoteDebugger", {
          module: "resource://gre/modules/GeckoViewRemoteDebugger.jsm",
          init: gvrd => gvrd.onInit(),
        });

        GeckoViewUtils.addLazyPrefObserver(
          {
            name: "devtools.debugger.remote-enabled",
            default: false,
          },
          {
            handler: _ => this.GeckoViewRemoteDebugger,
          }
        );

        GeckoViewUtils.addLazyGetter(this, "DownloadTracker", {
          module: "resource://gre/modules/GeckoViewWebExtension.jsm",
          ged: ["GeckoView:WebExtension:DownloadChanged"],
        });

        ChromeUtils.import("resource://gre/modules/NotificationDB.jsm");

        // Listen for global EventDispatcher messages
        lazy.EventDispatcher.instance.registerListener(this, [
          "GeckoView:ResetUserPrefs",
          "GeckoView:SetDefaultPrefs",
          "GeckoView:SetLocale",
          "GeckoView:InstallCertFile",
        ]);

        lazy.Services.obs.addObserver(
          this,
          "browser-idle-startup-tasks-finished"
        );

        lazy.Services.obs.notifyObservers(null, "geckoview-startup-complete");
        break;
      }
      case "browser-idle-startup-tasks-finished": {
        // TODO bug 1730026: when an alternative is introduced that runs once,
        // replace this observer topic with that alternative.
        // This only needs to happen once during startup.
        lazy.Services.obs.removeObserver(this, aTopic);
        // Notify the start up crash tracker that the browser has successfully
        // started up so the startup cache isn't rebuilt on next startup.
        lazy.Services.startup.trackStartupCrashEnd();
        break;
      }
    }
  }

  onEvent(aEvent, aData, aCallback) {
    debug`onEvent ${aEvent}`;

    switch (aEvent) {
      case "GeckoView:ResetUserPrefs": {
        const prefs = new lazy.Preferences();
        prefs.reset(aData.names);
        break;
      }
      case "GeckoView:SetDefaultPrefs": {
        const prefs = new lazy.Preferences({ defaultBranch: true });
        for (const name of Object.keys(aData)) {
          try {
            prefs.set(name, aData[name]);
          } catch (e) {
            warn`Failed to set preference ${name}: ${e}`;
          }
        }
        break;
      }
      case "GeckoView:SetLocale":
        if (aData.requestedLocales) {
          lazy.Services.locale.requestedLocales = aData.requestedLocales;
        }
        const pls = Cc["@mozilla.org/pref-localizedstring;1"].createInstance(
          Ci.nsIPrefLocalizedString
        );
        pls.data = aData.acceptLanguages;
        lazy.Services.prefs.setComplexValue(
          "intl.accept_languages",
          Ci.nsIPrefLocalizedString,
          pls
        );
        break;

      case "GeckoView:AddRootCertificate":
        (async () => {
          let certfilename = aData.rootCertificate;
          if (certfilename == "") {
            return;
          }
          lazy.log.debug(`Installing cert file - ${certfilename}`);
          let certfile;
          try {
            certfile = Cc["@mozilla.org/file/local;1"].createInstance(
              Ci.nsIFile
            );
            certfile.initWithPath(certfilename);
          } catch (e) {
            lazy.log.error(`Unable to init certfile - ${certfilename}: ${e}`);
          }
          let file;
          try {
            file = await File.createFromNsIFile(certfile);
          } catch (e) {
            lazy.log.error(`Unable to find certificate - ${certfilename}`);
            return;
          }
          let reader = new FileReader();
          reader.onloadend = function() {
            if (reader.readyState != reader.DONE) {
              lazy.log.error(`Unable to read certificate - ${certfile.path}`);
              return;
            }
            let certFile = reader.result;
            let certFileArray = [];
            for (let i = 0; i < certFile.length; i++) {
              certFileArray.push(certFile.charCodeAt(i));
            }
            let cert;
            try {
              cert = lazy.gCertDB.constructX509(certFileArray);
            } catch (e) {
              try {
                // It might be PEM instead of DER.
                cert = lazy.gCertDB.constructX509FromBase64(
                  pemToBase64(certFile)
                );
              } catch (ex) {
                lazy.log.error(
                  `Unable to add certificate - ${certfile.path}`,
                  ex
                );
              }
            }
            if (cert) {
              if (
                lazy.gCertDB.isCertTrusted(
                  cert,
                  Ci.nsIX509Cert.CA_CERT,
                  Ci.nsIX509CertDB.TRUSTED_SSL
                )
              ) {
                // Certificate is already installed.
                lazy.log.debug(`Cert is already installed: ${certFile}`)
                return;
              }
              try {
                lazy.gCertDB.addCert(certFile, "CT,CT,");
              } catch (e) {
                // It might be PEM instead of DER.
                lazy.gCertDB.addCertFromBase64(
                  pemToBase64(certFile),
                  "CT,CT,"
                );
              }
            }
          };
          reader.readAsBinaryString(file);
          }
        )();
        break;


      case "GeckoView:StorageDelegate:Attached":
        InitLater(() => {
          const loginDetection = Cc[
            "@mozilla.org/login-detection-service;1"
          ].createInstance(Ci.nsILoginDetectionService);
          loginDetection.init();
        });
        break;
    }
  }
}

function pemToBase64(pem) {
  return pem
    .replace(/(.*)-----BEGIN CERTIFICATE-----/, "")
    .replace(/-----END CERTIFICATE-----(.*)/, "")
    .replace(/[\r\n]/g, "");
}

GeckoViewStartup.prototype.classID = Components.ID(
  "{8e993c34-fdd6-432c-967e-f995d888777f}"
);
GeckoViewStartup.prototype.QueryInterface = ChromeUtils.generateQI([
  "nsIObserver",
]);
