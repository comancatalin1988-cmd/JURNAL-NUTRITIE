package com.jurnalnutritie.app

import androidx.activity.result.ActivityResultLauncher
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Instant

@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {
    private val scope = CoroutineScope(Dispatchers.Main)
    private var pendingPermissionCall: PluginCall? = null
    private lateinit var permissionLauncher: ActivityResultLauncher<Set<String>>

    override fun load() {
        permissionLauncher = bridge.activity.registerForActivityResult(
            PermissionController.createRequestPermissionResultContract()
        ) { granted ->
            val call = pendingPermissionCall ?: return@registerForActivityResult
            pendingPermissionCall = null
            val ret = JSObject()
            ret.put("granted", granted.contains(HealthPermission.getReadPermission(StepsRecord::class)))
            call.resolve(ret)
        }
    }

    private fun isHealthConnectAvailable(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
            HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE
    }

    private fun client(): HealthConnectClient? {
        if (!isHealthConnectAvailable()) return null
        return try {
            HealthConnectClient.getOrCreate(context)
        } catch (_: Throwable) {
            null
        }
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", isHealthConnectAvailable())
        call.resolve(ret)
    }

    @PluginMethod
    fun requestStepsPermission(call: PluginCall) {
        val c = client()
        if (c == null) {
            call.resolve(JSObject().put("granted", false))
            return
        }
        val permission = HealthPermission.getReadPermission(StepsRecord::class)
        scope.launch {
            val granted = c.permissionController.getGrantedPermissions()
            if (granted.contains(permission)) {
                call.resolve(JSObject().put("granted", true))
            } else {
                pendingPermissionCall = call
                permissionLauncher.launch(setOf(permission))
            }
        }
    }

    @PluginMethod
    fun readSteps(call: PluginCall) {
        val c = client()
        if (c == null) {
            call.reject("Health Connect indisponibil")
            return
        }
        val start = call.getString("start") ?: return call.reject("start lipsă")
        val end = call.getString("end") ?: return call.reject("end lipsă")
        scope.launch {
            try {
                val result = c.aggregate(
                    AggregateRequest(
                        metrics = setOf(StepsRecord.COUNT_TOTAL),
                        timeRangeFilter = TimeRangeFilter.between(
                            Instant.parse(start), Instant.parse(end)
                        )
                    )
                )
                val ret = JSObject()
                ret.put("steps", result[StepsRecord.COUNT_TOTAL] ?: 0L)
                call.resolve(ret)
            } catch (t: Throwable) {
                call.reject("Nu am putut citi pașii", Exception(t))
            }
        }
    }
}
