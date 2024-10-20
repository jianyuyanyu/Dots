﻿
using System;
using System.Collections.ObjectModel;
using System.Diagnostics;
using CommunityToolkit.Mvvm.Input;
using Dots.Models;
using Dots.Services;
using System.Reactive;
using Dots.Data;
using Dots.Helpers;
using ObservableView;
using ObservableView.Searching.Operators;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows.Input;


namespace Dots.ViewModels;

public partial class MainViewModel : ObservableRecipient
{
    public MainViewModel(DotnetService dotnet, ErrorPopupHelper errorHelper)
    {
        _dotnet = dotnet;
        _errorHelper = errorHelper;
        _progressTasks = new ObservableCollection<ProgressTask>();
        SelectedFilterIcon = LucideIcons.ListFilter;
    }

    string _query = "";
    bool _isLoading = false;

    DotnetService _dotnet;
    ErrorPopupHelper _errorHelper;
    List<Sdk> _baseSdks;

    [ObservableProperty]
    bool _selectionEnabled;

    [ObservableProperty]
    bool _isBusy;

    [ObservableProperty]
    Sdk _selectedSdk;

    [ObservableProperty]
    ObservableView<Sdk> _sdks;

    [ObservableProperty]
    string _lastUpdated;

    [ObservableProperty]
    bool _showDetails = false;

    [ObservableProperty]
    ObservableCollection<ProgressTask> _progressTasks;

    [ObservableProperty]
    string _selectedFilterIcon;

    bool _showOnline = true;
    bool _showInstalled = true;

    [ObservableProperty]
    bool _emptyData;

    public bool SetSelectedSdk(Sdk sdk)
    {
        var showDetails = true;
        if (sdk is null)
        {
            showDetails = false;
        }
        else if (SelectedSdk is null)
        {
            showDetails = true;
        }
        else if (sdk is not null && sdk.VersionDisplay == SelectedSdk.VersionDisplay)
        {
            showDetails = !ShowDetails;
        }
        ShowDetails = showDetails;
        EmptyData = sdk?.Data is null;

        if (sdk?.VersionDisplay == SelectedSdk?.VersionDisplay)
        {
            SelectedSdk = null;
            return true;
        }
        else
        {
            SelectedSdk = sdk;
            return false;
        }
    }


    [RelayCommand]
    async Task DownloadScript()
    {
        try
        {
            using var client = new HttpClient();
            var response = await client.GetAsync(Constants.InstallerScript);
            var content = await response.Content.ReadAsStringAsync();
            //save file to disk
            var folder = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (!Directory.Exists(folder))
            {
                Directory.CreateDirectory(folder);
            }


            var filename = Path.Combine(folder, "dotnet-install.ps1");
            await File.WriteAllTextAsync(filename, content);
            Debug.WriteLine("done - " + filename);

        }
        catch (Exception ex)
        {
            Console.WriteLine(ex);
        }
    }

    [RelayCommand(AllowConcurrentExecutions = true)]
    async Task ListSdks()
    {
        LastUpdated = " " + DateTime.Now.ToString("MMMM dd, yyyy HH:mm");
        await CheckSdks(true);
    }

    [RelayCommand]
    void FilterSdks(string query)
    {
        _query = query;
        Sdks.Search(_query);

        var filteredCollection = _baseSdks.Where(s =>
        s.Data.Sdk.Version.ToLowerInvariant().Contains(query.ToLowerInvariant()) ||
        s.Path.ToLowerInvariant().Contains(query.ToLowerInvariant())).ToList();

        foreach (var s in _baseSdks)
        {
            if (!filteredCollection.Contains(s))
            {
                Sdks.View.Remove(s);
            }
            else if (!Sdks.View.Contains(s))
            {
                Sdks.View.Add(s);
            }
        }
    }

    [RelayCommand]
    void ToggleSelection()
    { }

    [RelayCommand]
    void ApplyFilter(string f)
    {
        int filter = int.Parse(f);
        //0 all
        //1 online
        //2 installed
        if(filter == 0)
        {
            _showOnline = true;
            _showInstalled = true;
            SelectedFilterIcon = LucideIcons.ListFilter;
        }
        else if (filter == 1)
        {
            _showInstalled = false;
            _showOnline = true;
            SelectedFilterIcon = LucideIcons.Cloudy;
        }
        else if(filter == 2)
        {
            _showOnline = false;
            _showInstalled = true;
            SelectedFilterIcon = LucideIcons.HardDrive;
        }
        Sdks.Search(" ");
        Sdks.Search(_query);

        if (!Sdks.View.Contains(SelectedSdk))
        {
            SelectedSdk = null;
        }
    }

    public ICommand MyTestCommand { get; set; }

    [RelayCommand(AllowConcurrentExecutions = true)]
    async Task OpenOrDownload(Sdk sdk)
    {
        try
        {
            sdk.IsDownloading = true;
            if (sdk.Installed)
            {
                sdk.StatusMessage = Constants.OpeningText;
                await _dotnet.OpenFolder(sdk);
            }
            else
            {
                sdk.StatusMessage = Constants.DownloadingText;
                var path = await _dotnet.Download(sdk, true);
                await _dotnet.OpenFolder(path);
            }
            sdk.IsDownloading = false;

        }
        catch (Exception ex)
        {
            sdk.IsDownloading = false;
            await _errorHelper.ShowPopup(ex);
        }
    }

    [RelayCommand(AllowConcurrentExecutions = true)]
    async Task InstallOrUninstall(Sdk sdk)
    {
        try
        {
            sdk.IsInstalling = true;

            if (sdk.Installed)
            {
                sdk.StatusMessage = Constants.UninstallingText;
                var result = await _dotnet.Uninstall(sdk);
                if (result)
                {
                    sdk.Path = string.Empty;
                }
            }
            else
            {
                sdk.StatusMessage = Constants.DownloadingText;
                var path = await _dotnet.Download(sdk);
                if (!string.IsNullOrEmpty(path))
                {
                    sdk.StatusMessage = Constants.InstallingText;
                    var result = await _dotnet.Install(path);
                    if (result)
                    {
                        sdk.Path = await _dotnet.GetInstallationPath(sdk);
                    }
                    else
                    {
                        //show popup and prompt to manually install
                    }
                }
            }
            sdk.IsInstalling = false;
        }

        catch (Exception ex)
        {
            sdk.IsInstalling = false;
            await _errorHelper.ShowPopup(ex);
        }
    }

    [RelayCommand]
    void ToggleMultiSelection()
    {

    }

    [RelayCommand]
    void OpenSettings()
    { }

    void Sdks_FilterHandler(object sender, ObservableView.Filtering.FilterEventArgs<Sdk> e)
    {
        if (_showOnline && _showInstalled)
        {
            e.IsAllowed = true;
        }
        else if (_showOnline && !_showInstalled)
        {
            e.IsAllowed = !e.Item.Installed;
        }
        else if (!_showOnline && _showInstalled)
        {
            e.IsAllowed = e.Item.Installed;
        }
        else
        {
            e.IsAllowed = false;
        }
    }

    public async Task CheckSdks(bool force = false)
    {
        try
        {
            if (_isLoading) return;
            _isLoading = true;
            if (Sdks is not null) Sdks.FilterHandler -= Sdks_FilterHandler;
            IsBusy = true;
            var sdkList = await _dotnet.GetSdks(force);
            Sdks = new ObservableView<Sdk>(sdkList.DistinctBy(s => s.VersionDisplay));
            Sdks.SearchSpecification.Add(x => x.VersionDisplay, BinaryOperator.Contains);
            Sdks.SearchSpecification.Add(x => x.Path, BinaryOperator.Contains);
            Sdks.FilterHandler += Sdks_FilterHandler;

            _baseSdks = sdkList;
            LastUpdated = " " + DateTime.Now.ToString("MMMM dd, yyyy HH:mm");
            IsBusy = false;
            _isLoading = false;
        }
        catch (Exception ex)
        {
            await _errorHelper.ShowPopup(ex);
        }
    }
}
