package com.jurnalnutritie.app

import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.PermissionController
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
            val permission = HealthPermission.getReadPermission(StepsRecord::class)
            call.resolve(JSObject().put("granted", granted.contains(permission)))
        }
    }

    private fun sdkStatus(): Int = HealthConnectClient.getSdkStatus(context)

    private fun client(): HealthConnectClient? =
        if (sdkStatus() == HealthConnectClient.SDK_AVAILABLE) HealthConnectClient.getOrCreate(context) else null

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        try {
            val status = sdkStatus()
            call.resolve(
                JSObject()
                    .put("available", status == HealthConnectClient.SDK_AVAILABLE)
                    .put("status", status)
            )
        } catch (t: Throwable) {
            call.reject("Verificarea Health Connect a eșuat: ${t.message ?: t.javaClass.simpleName}", Exception(t))
        }
    }

    @PluginMethod
    fun requestStepsPermission(call: PluginCall) {
        scope.launch {
            try {
                val c = client()
                if (c == null) {
                    call.reject("Health Connect nu este disponibil pe telefon (status ${sdkStatus()}).")
                    return@launch
                }
                val permission = HealthPermission.getReadPermission(StepsRecord::class)
                val granted = c.permissionController.getGrantedPermissions()
                if (granted.contains(permission)) {
                    call.resolve(JSObject().put("granted", true))
                } else {
                    pendingPermissionCall = call
                    permissionLauncher.launch(setOf(permission))
                }
            } catch (t: Throwable) {
                pendingPermissionCall = null
                call.reject("Cererea permisiunii pentru pași a eșuat: ${t.message ?: t.javaClass.simpleName}", Exception(t))
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
                call.resolve(JSObject().put("steps", result[StepsRecord.COUNT_TOTAL] ?: 0L))
            } catch (t: Throwable) {
                call.reject("Nu am putut citi pașii: ${t.message ?: t.javaClass.simpleName}", Exception(t))
            }
        }
    }
}
