import Foundation
import AppKit

func getAssetPath(_ filename: String) -> String {
    let execURL = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent()
    let execPath = execURL.appendingPathComponent(filename).path
    if FileManager.default.fileExists(atPath: execPath) {
        return execPath
    }
    let mainPath = Bundle.main.bundlePath
    let localPath = (mainPath as NSString).appendingPathComponent(filename)
    if FileManager.default.fileExists(atPath: localPath) {
        return localPath
    }
    let cwdPath = FileManager.default.currentDirectoryPath + "/" + filename
    if FileManager.default.fileExists(atPath: cwdPath) {
        return cwdPath
    }
    return filename
}
